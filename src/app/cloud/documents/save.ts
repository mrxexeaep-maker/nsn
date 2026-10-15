import { useLocalStorage } from '@vueuse/core'
import { computed, ref, shallowRef, watch } from 'vue'

import type { EditorStore } from '@/app/editor/session'
import {
  activeStorageProviderID,
  isStorageConfigured,
  readStoragePreferences
} from '@/app/integrations/storage'
import { rememberRecentStorageDocument } from '@/app/recent-files'
import { openSettingsDialog } from '@/app/settings/dialog'
import { getLocalCanvasStore } from '@/app/storage/local-store'
import { getOutbox, syncUIState, uploadProgressByCanvas } from '@/app/storage/sync'
import { onStorageWorkspaceEvent } from '@/app/storage/workspace/events'
import { IS_BROWSER } from '@/constants'

import { openCloudConnect } from '../connect/flow'
import { cloudServerHost } from '../servers/address'
import { cloudServers, findCloudServer } from '../servers/store'
import { cloudAPIClient, cloudConnection, refreshCloudConnection } from '../sessions/connection'
import { CLOUD_STORAGE_PROVIDER_ID } from '../sessions/token'

export type CloudSaveState =
  | { kind: 'ready' }
  | { kind: 'saving'; sentBytes: number; totalBytes: number }
  | { kind: 'error'; reason: 'too-large'; limitBytes: number }
  | { kind: 'error'; reason: 'offline' | 'quota' | 'unavailable' }

/** Where Save to can put a document: a signed-in server's workspaces, or the storage bucket. */
export type SaveDestinationGroup =
  | {
      kind: 'cloud'
      serverId: string
      host: string
      workspaces: { id: string; name: string; role: 'viewer' | 'editor' | 'admin' }[]
    }
  | { kind: 'storage'; providerId: string; label: string }

export const cloudSaveOpen = ref(false)
export const cloudSaveName = ref('')
/** `cloud/serverId/workspaceId` or `storage/providerId`: the chosen destination. */
export const cloudSaveDestination = ref('')
export const cloudSaveState = shallowRef<CloudSaveState>({ kind: 'ready' })
export const cloudSaveDestinations = shallowRef<SaveDestinationGroup[]>([])
/** The destination saved to last, chosen first next time. */
const lastDestination = IS_BROWSER ? useLocalStorage('open-pencil:save-destination', '') : ref('')
let target: EditorStore | null = null

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

async function storageDestination(): Promise<SaveDestinationGroup[]> {
  const providerId = activeStorageProviderID.value
  if (!(await isStorageConfigured(providerId))) return []
  const bucket = readStoragePreferences(providerId).bucket.trim()
  return [{ kind: 'storage', providerId, label: bucket || providerId }]
}

/** Every destination the document can go to, as `kind/...` keys a writer can save to. */
function writableKeys(groups: SaveDestinationGroup[]): string[] {
  return groups.flatMap((group) =>
    group.kind === 'storage'
      ? [`storage/${group.providerId}`]
      : group.workspaces
          .filter((workspace) => workspace.role !== 'viewer')
          .map((workspace) => `cloud/${group.serverId}/${workspace.id}`)
  )
}

/** Servers still being checked are waited for, so a fresh start does not look signed out. */
async function settledCloudDestinations(): Promise<SaveDestinationGroup[]> {
  const checking = cloudServers.value.filter(
    (server) => cloudConnection(server.id).state === 'checking'
  )
  await Promise.all(checking.map((server) => refreshCloudConnection(server)))
  return cloudDestinations.value
}

/**
 * Save to: straight to the only place the document can go, or a choice when there are several.
 * With nowhere to save yet, it signs in to the server this app knows, or opens Cloud settings.
 */
export async function openSaveTo(store: EditorStore): Promise<void> {
  const groups = [...(await settledCloudDestinations()), ...(await storageDestination())]
  const keys = writableKeys(groups)
  target = store
  cloudSaveName.value = store.state.documentName || 'Untitled'
  cloudSaveState.value = { kind: 'ready' }
  cloudSaveDestinations.value = groups
  if (keys.length === 0) {
    const signedOut = cloudServers.value.find((server) => {
      const state = cloudConnection(server.id).state
      return state === 'expired' || state === 'signed-out'
    })
    if (signedOut) openCloudConnect({ serverId: signedOut.id })
    else openSettingsDialog('cloud')
    return
  }
  if (keys.length === 1) {
    cloudSaveDestination.value = keys[0] ?? ''
    // The dialog only appears when the save fails, to say why.
    if (!(await saveToDestination())) cloudSaveOpen.value = true
    return
  }
  cloudSaveDestination.value = keys.includes(lastDestination.value)
    ? lastDestination.value
    : (keys[0] ?? '')
  cloudSaveOpen.value = true
}

/**
 * Follows a new document's first upload: true once it is on the server, or when the person
 * closes the dialog and leaves it to finish in the background; false when the upload failed.
 */
function waitForFirstUpload(documentId: string, totalBytes: number): Promise<boolean> {
  return new Promise((resolve) => {
    const stops: (() => void)[] = []
    const finish = (uploaded: boolean) => {
      for (const stop of stops) stop()
      resolve(uploaded)
    }
    async function check() {
      const meta = await getLocalCanvasStore().getMeta(documentId)
      if (meta?.syncStatus === 'synced') return finish(true)
      // The engine parks a job it cannot finish until the person acts, rather than dropping it.
      const jobs = await getOutbox().list()
      const parked = jobs.some(
        (job) => job.canvasId === documentId && job.nextAttemptAt === Number.MAX_SAFE_INTEGER
      )
      if (meta?.syncStatus === 'error' || parked) finish(false)
    }
    stops.push(
      watch(uploadProgressByCanvas, (progress) => {
        const sent = progress.get(documentId)
        if (sent !== undefined) {
          cloudSaveState.value = { kind: 'saving', sentBytes: sent * totalBytes, totalBytes }
        }
      }),
      watch(cloudSaveOpen, (open) => {
        if (!open) finish(true)
      }),
      // Failures move the engine's state without a document event.
      watch(syncUIState, () => void check()),
      onStorageWorkspaceEvent((event) => {
        if (event.documentId === documentId) void check()
      })
    )
    // A small file can finish uploading before these watchers exist.
    void check()
  })
}

/**
 * Why the first upload failed, from the workspace's limits: the server refuses a file over its
 * size limit or one that does not fit the remaining storage without saying which.
 */
async function uploadFailure(
  serverId: string,
  workspaceId: string,
  size: number
): Promise<CloudSaveState> {
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

async function saveToStorageBucket(store: EditorStore, providerId: string): Promise<boolean> {
  if (!(await store.saveFigFileToStorage({ providerId }))) return false
  const binding = store.getStorageBinding()
  if (binding) rememberRecentStorageDocument(binding, store.state.documentName)
  return true
}

/**
 * Saves the document to the chosen destination. A Cloud copy is kept on this device and the tab
 * moves to it at once, then the save follows the first upload. The file it came from is left as
 * it was.
 */
export async function saveToDestination(): Promise<boolean> {
  const store = target
  const destination = cloudSaveDestination.value
  const [kind, first, second] = destination.split('/')
  const name = cloudSaveName.value.trim()
  if (!store || !name || !first) return false
  if (!navigator.onLine) {
    cloudSaveState.value = { kind: 'error', reason: 'offline' }
    return false
  }
  const previousName = store.state.documentName
  store.state.documentName = name
  cloudSaveState.value = { kind: 'saving', sentBytes: 0, totalBytes: 0 }
  if (kind === 'storage') {
    if (!(await saveToStorageBucket(store, first))) {
      store.state.documentName = previousName
      cloudSaveState.value = { kind: 'error', reason: 'unavailable' }
      return false
    }
    lastDestination.value = destination
    cloudSaveOpen.value = false
    return true
  }
  const serverId = first
  const workspaceId = second
  if (!workspaceId) return false
  const location = {
    providerId: CLOUD_STORAGE_PROVIDER_ID,
    profileId: serverId,
    containerId: workspaceId
  }
  if (!(await store.saveFigFileToStorage(location))) {
    // Nothing was saved, so the tab keeps the name it had.
    store.state.documentName = previousName
    cloudSaveState.value = { kind: 'error', reason: 'unavailable' }
    return false
  }
  lastDestination.value = destination
  const binding = store.getStorageBinding()
  if (!binding) return false
  rememberRecentStorageDocument(binding, name)
  const meta = await getLocalCanvasStore().getMeta(binding.documentId)
  const size = meta?.figSize ?? 0
  if (!(await waitForFirstUpload(binding.documentId, size))) {
    cloudSaveState.value = await uploadFailure(serverId, workspaceId, size)
    return false
  }
  cloudSaveOpen.value = false
  return true
}
