import { RELAY_DOCUMENT_PARAM, RELAY_PATH } from '#cloud/contract'
import { createPostgresCloudDatabase } from '#cloud/runtime/postgres/database'
import {
  createCollaborationRelay,
  createCollaborationStateStore,
  createConfiguredCloudPolicy,
  relayDocumentLookups,
  type CollaborationRelay,
  type RelayConnection
} from '#cloud/server'
import * as v from 'valibot'

import type { CloudflareCloudEnvironment, PreparedCloudflareCloud } from './environment'

/** What the Worker asks a document's relay object besides sockets; never routed from outside. */
const RELAY_ACTIONS = { startOver: '/start-over', announceVersions: '/versions' } as const

const documentIdSchema = v.pipe(v.string(), v.uuid())

function documentOf(request: Request): string | null {
  const documentId = new URL(request.url).searchParams.get(RELAY_DOCUMENT_PARAM)
  return v.is(documentIdSchema, documentId) ? documentId : null
}

function relayObject(env: CloudflareCloudEnvironment, documentId: string) {
  return env.RELAY.get(env.RELAY.idFromName(documentId))
}

/**
 * Sends a relay socket to its document's relay object. The ticket's URL names the document; the
 * object refuses tickets for any other.
 */
export function routeToRelay(request: Request, env: CloudflareCloudEnvironment) {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected a WebSocket upgrade', { status: 426 })
  }
  const documentId = documentOf(request)
  if (!documentId) return new Response('Missing document', { status: 400 })
  return relayObject(env, documentId).fetch(request)
}

/** Asks a document's relay object to act on its live rooms. */
export async function tellRelay(
  env: CloudflareCloudEnvironment,
  documentId: string,
  action: keyof typeof RELAY_ACTIONS
): Promise<void> {
  const url = new URL(RELAY_ACTIONS[action], 'https://relay.internal')
  url.searchParams.set(RELAY_DOCUMENT_PARAM, documentId)
  const response = await relayObject(env, documentId).fetch(url, { method: 'POST' })
  if (!response.ok) throw new Error(`The relay could not ${action}: ${response.status}`)
}

/** A socket message's bytes; text is passed on as bytes for the relay to refuse. */
function bytes(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return new TextEncoder().encode(typeof data === 'string' ? data : '')
}

/** Hands a WebSocket the Worker accepted to the relay, as the Node runtime does with `ws`. */
function accept(relay: CollaborationRelay): Response {
  const { 0: client, 1: server } = new WebSocketPair()
  // Standard sockets deliver binary messages as Blobs unless asked otherwise.
  server.binaryType = 'arraybuffer'
  server.accept()
  let connection: RelayConnection | null = null
  const closed = () => {
    connection?.closed()
    connection = null
  }
  connection = relay.connect({
    send: (data) => server.send(data),
    close(code, reason) {
      // A socket the client already closed throws on a second close.
      if (server.readyState === WebSocket.OPEN) server.close(code, reason)
    }
  })
  server.addEventListener('message', ({ data }: { data: unknown }) =>
    connection?.receive(bytes(data))
  )
  server.addEventListener('close', closed)
  server.addEventListener('error', closed)
  return new Response(null, { status: 101, webSocket: client })
}

/**
 * The Durable Object class holding one document's live rooms: every epoch of the document meets
 * on one relay, so a restore or a version change reaches all of them in one call. Sockets stay
 * open without hibernation, so the rooms' documents and timers live in memory as on Node.
 */
export function createCloudflareRelayObject(
  prepare: (env: CloudflareCloudEnvironment) => Promise<PreparedCloudflareCloud>
) {
  return class CollaborationRelayObject {
    #relay: Promise<CollaborationRelay> | null = null

    constructor(
      _state: DurableObjectState,
      private readonly env: CloudflareCloudEnvironment
    ) {}

    #open(documentId: string) {
      this.#relay ??= prepare(this.env).then(({ config }) => {
        const database = createPostgresCloudDatabase({ connectionString: config.databaseURL })
        return createCollaborationRelay({
          authSecret: config.authSecret,
          documentId,
          store: createCollaborationStateStore(database),
          maximumMessageBytes: config.technicalLimits.maximumCollaborationMessageBytes,
          maximumConnectionsPerRoom: config.technicalLimits.maximumConnectionsPerRoom,
          ...relayDocumentLookups(
            database,
            createConfiguredCloudPolicy(config, database),
            config.deployment
          )
        })
      })
      this.#relay.catch(() => {
        this.#relay = null
      })
      return this.#relay
    }

    async fetch(request: Request): Promise<Response> {
      const documentId = documentOf(request)
      if (!documentId) return new Response('Missing document', { status: 400 })
      const path = new URL(request.url).pathname
      if (path === RELAY_PATH) return accept(await this.#open(documentId))
      // Nobody is in a room the object never opened, so there is nothing to tell.
      const relay = await this.#relay
      if (path === RELAY_ACTIONS.startOver) relay?.startOver(documentId)
      else if (path === RELAY_ACTIONS.announceVersions) relay?.announceVersions(documentId)
      else return new Response(null, { status: 404 })
      return new Response(null, { status: 204 })
    }
  }
}
