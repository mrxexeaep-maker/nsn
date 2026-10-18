import { computed, ref, shallowRef, watch, type Ref } from 'vue'

import type { DocumentVersion } from '@open-pencil/cloud/contract'

import type { EditorStore } from '@/app/editor/session'

import { cloudRoomPermissions } from '../rooms/live'
import { listVersions, versionHistoryAccountId } from './actions'
import { versionHistoryOf, versionListRevision } from './history'

/**
 * The document's history as the panel lists it, newest first and a page at a time, with Figma's
 * filters: everyone's versions or only yours, and autosaves shown or hidden.
 */
export function useVersionList(shown: Ref<EditorStore>) {
  const document = computed(() => versionHistoryOf(shown.value)?.store ?? shown.value)
  const versions = shallowRef<DocumentVersion[]>([])
  const nextCursor = ref<string | null>(null)
  const loading = ref(false)
  const failed = ref(false)
  const onlyYours = ref(false)
  const showAutosaves = ref(true)
  let generation = 0

  async function load(before?: string) {
    const current = ++generation
    loading.value = true
    failed.value = false
    try {
      const page = await listVersions(document.value, before)
      if (current !== generation) return
      versions.value = before ? [...versions.value, ...page.versions] : page.versions
      nextCursor.value = page.nextCursor
    } catch (error) {
      if (current !== generation) return
      failed.value = true
      console.warn('[Cloud] Loading the version history failed:', error)
    } finally {
      if (current === generation) loading.value = false
    }
  }

  watch([document, versionListRevision], () => void load(), { immediate: true })

  const accountId = computed(() => versionHistoryAccountId(document.value))
  const byId = computed(() => new Map(versions.value.map((version) => [version.id, version])))
  /** A restore reads as a named entry, as Figma lists "Restored version: …". */
  const isNamed = (version: DocumentVersion) =>
    version.kind === 'named' || version.restoredFromVersionId !== null
  const listed = computed(() =>
    versions.value.filter(
      (version) =>
        (showAutosaves.value || isNamed(version)) &&
        (!onlyYours.value || version.createdBy.id === accountId.value)
    )
  )
  const canEdit = computed(() => cloudRoomPermissions.value.get(document.value) !== 'view')

  return {
    document,
    versions: listed,
    nextCursor,
    loading,
    failed,
    onlyYours,
    showAutosaves,
    canEdit,
    isNamed,
    restoredFrom: (version: DocumentVersion) =>
      version.restoredFromVersionId ? byId.value.get(version.restoredFromVersionId) : undefined,
    loadOlder: () => (nextCursor.value ? load(nextCursor.value) : Promise.resolve()),
    reload: () => load()
  }
}
