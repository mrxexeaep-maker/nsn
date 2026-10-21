import { createServer } from 'node:http'

import { defaultRelayURL } from '#cloud/contract'
import { createS3ObjectStore } from '#cloud/runtime/s3/objects'
import {
  createCloudApp,
  loadAISigningKey,
  createCloudAuthenticationRuntime,
  createCollaborationRelay,
  createCollaborationStateStore,
  cleanupPassOptions,
  createCleanupServices,
  createConfiguredCloudPolicy,
  relayDocumentLookups,
  startCleanupWorker,
  startTransactionalEmailWorker,
  withIndexingPolicy
} from '#cloud/server'
import { getRequestListener } from '@hono/node-server'

import { createMigratedNodeCloudDatabase } from './bootstrap'
import { createNodeTransactionalEmailRuntime } from './email/runtime'
import { createNodeCloudPortal } from './portal'
import { attachCollaborationRelay } from './relay'

export type NodeCloudServerOptions = {
  environment?: Readonly<Record<string, string | undefined>>
  port?: number
}

export async function startNodeCloudServer(options: NodeCloudServerOptions = {}) {
  const environment = options.environment ?? process.env
  const { config, database } = await createMigratedNodeCloudDatabase(environment)
  // Before any worker starts, so a key that cannot sign leaves nothing running.
  const aiSigningKey = await loadAISigningKey(config).catch(async (error: unknown) => {
    await database.destroy()
    throw error
  })
  const objects = createS3ObjectStore(config)
  const {
    email,
    invitationOutbox,
    transport: emailTransport
  } = createNodeTransactionalEmailRuntime(config, database)
  const { auth, enrollment } = createCloudAuthenticationRuntime(config, database, email)
  const policy = createConfiguredCloudPolicy(config, database)
  const cleanup = config.cleanupEnabled
    ? startCleanupWorker(createCleanupServices(config, database, objects, policy), {
        ...cleanupPassOptions(config),
        intervalMs: config.cleanupIntervalMs,
        onError: (error) => console.error('[Cloud] Cleanup worker failed:', error)
      })
    : undefined
  const relay = createCollaborationRelay({
    authSecret: config.authSecret,
    store: createCollaborationStateStore(database),
    maximumMessageBytes: config.technicalLimits.maximumCollaborationMessageBytes,
    maximumConnectionsPerRoom: config.technicalLimits.maximumConnectionsPerRoom,
    ...relayDocumentLookups(database, policy, config.deployment)
  })
  const app = createCloudApp({
    config,
    database,
    auth,
    objects,
    invitationOutbox,
    transactionalEmail: email,
    enrollment,
    aiSigningKey,
    relayURL: config.relayURL ?? defaultRelayURL(config.publicURL),
    onDocumentRestored: (documentId) => relay.startOver(documentId),
    onDocumentVersionsChanged: (documentId) => relay.announceVersions(documentId)
  })
  const emailWorker = emailTransport
    ? startTransactionalEmailWorker(email, {
        batchSize: config.emailBatchSize,
        intervalMs: config.emailIntervalMs,
        leaseDurationMs: config.emailLeaseDurationMs,
        maximumAttempts: config.emailMaximumAttempts,
        onError: (error) => console.error('[Cloud] Email worker failed:', error)
      })
    : undefined
  const portalDirectory = environment.OPENPENCIL_CLOUD_PORTAL_DIR
  const portal = portalDirectory ? createNodeCloudPortal(portalDirectory) : undefined
  // Without the portal build, sign-in, account, and administration pages answer 404.
  if (!portal)
    console.warn('[Cloud] OPENPENCIL_CLOUD_PORTAL_DIR is not set; sign-in pages are off.')
  const server = await listen(
    async (request) => {
      const path = new URL(request.url).pathname
      const page = await portal?.page(request)
      if (page) return withIndexingPolicy(page, path, config.indexingPolicy)
      const response = await app.fetch(request)
      const file = response.status === 404 ? await portal?.file(request) : null
      return withIndexingPolicy(file ?? response, path, config.indexingPolicy)
    },
    options.port ?? Number(environment.PORT ?? 8787),
    environment.HOST ?? '0.0.0.0'
  )
  const relayListener = attachCollaborationRelay(
    server.http,
    relay,
    config.technicalLimits.maximumCollaborationMessageBytes
  )
  return {
    app,
    database,
    url: server.url,
    async stop() {
      await relayListener.close()
      await server.close()
      await cleanup?.stop()
      await emailWorker?.stop()
      await database.destroy()
    }
  }
}

async function listen(
  fetch: (request: Request) => Promise<Response>,
  port: number,
  hostname: string
) {
  const listener = getRequestListener(fetch)
  const server = createServer((request, response) => {
    void listener(request, response)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, hostname, () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  const boundPort = typeof address === 'object' && address ? address.port : port
  return {
    url: new URL(`http://localhost:${boundPort}`),
    http: server,
    close: () =>
      new Promise<void>((done, fail) => {
        server.close((error) => {
          if (error) fail(error)
          else done()
        })
      })
  }
}
