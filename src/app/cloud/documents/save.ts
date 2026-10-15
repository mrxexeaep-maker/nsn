import { computed } from 'vue'

import type { SaveDestinationGroup, SaveToState } from '@/app/storage/save-to'

import { openCloudConnect } from '../connect/flow'
import { cloudServerHost } from '../servers/address'
import { cloudServers, findCloudServer } from '../servers/store'
import { cloudAPIClient, cloudConnection, refreshCloudConnection } from '../sessions/connection'

/** Workspaces of every signed-in server, grouped by server. */
const cloudDestinations = computed(() =>
  cloudServers.value.flatMap((server): SaveDestinationGroup[] => {
    const connection = cloudConnection(server.id)
    if (connection.state !== 'signed-in' || !connection.workspaces.length) return []
    return [
      {
        kind: 'cloud',
        serverId: server.id,
        host: cloudServerHost(server.url),
        workspaces: connection.workspaces.map(({ id, name, role }) => ({ id, name, role }))
      }
    ]
  })
)

/**
 * Where Save to can put a document on Cloud servers. Servers still being checked are waited for,
 * so a fresh start does not look signed out.
 */
export async function cloudSaveDestinations(): Promise<SaveDestinationGroup[]> {
  const checking = cloudServers.value.filter(
    (server) => cloudConnection(server.id).state === 'checking'
  )
  await Promise.all(checking.map((server) => refreshCloudConnection(server)))
  return cloudDestinations.value
}

/** Signs in to a server this app knows but is signed out of; false when there is none. */
export function signInToSaveTo(): boolean {
  const signedOut = cloudServers.value.find((server) => {
    const state = cloudConnection(server.id).state
    return state === 'expired' || state === 'signed-out'
  })
  if (signedOut) openCloudConnect({ serverId: signedOut.id })
  return signedOut !== undefined
}

/**
 * Why the first upload failed, from the workspace's limits: the server refuses a file over its
 * size limit or one that does not fit the remaining storage without saying which.
 */
export async function cloudUploadFailure(
  serverId: string,
  workspaceId: string,
  size: number
): Promise<SaveToState> {
  const server = findCloudServer(serverId)
  const discovery = server ? cloudConnection(server.id).discovery : null
  if (!server || !discovery) return { kind: 'error', reason: 'unavailable' }
  const entitlements = await cloudAPIClient(server, discovery)
    .getWorkspaceEntitlements(workspaceId)
    .catch(() => null)
  if (!entitlements) return { kind: 'error', reason: 'unavailable' }
  const { limits, usage } = entitlements
  if (size > limits.maximumFileBytes) {
    return { kind: 'error', reason: 'too-large', limitBytes: limits.maximumFileBytes }
  }
  const stored = usage.committedStorageBytes + usage.reservedStorageBytes
  if (limits.maximumStorageBytes !== null && stored + size > limits.maximumStorageBytes) {
    return { kind: 'error', reason: 'quota' }
  }
  return { kind: 'error', reason: 'unavailable' }
}
