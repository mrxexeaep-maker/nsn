import * as v from 'valibot'

import type { CollabAction } from '@/app/collab/transport/types'
import type { EditorStore } from '@/app/editor/session'
import { followUpload, kickSyncEngine } from '@/app/storage/sync'

/** How long a tab waits for the room's saver to say the document is on its server. */
export const ROOM_UPLOAD_TIMEOUT_MS = 60_000

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64))
const UploadMessageSchema = v.pipe(
  v.string(),
  v.parseJson(),
  v.variant('type', [
    v.object({ type: v.literal('request'), id }),
    v.object({ type: v.literal('reply'), id, uploaded: v.boolean() })
  ])
)
type UploadMessage = v.InferOutput<typeof UploadMessageSchema>

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function encode(message: UploadMessage): Uint8Array {
  return encoder.encode(JSON.stringify(message))
}

/**
 * Uploads what the tab of `store` has not saved yet and follows it onto the server. Whether the
 * document there is now what the tab shows.
 */
export async function uploadStoredDocument(store: EditorStore): Promise<boolean> {
  const documentId = store.getStorageBinding()?.documentId
  if (!documentId) return false
  if (!store.state.autosaveEnabled || !store.hasUnsavedChanges()) return true
  await store.saveFigFile()
  await kickSyncEngine()
  return (await followUpload(documentId)) === 'uploaded'
}

/**
 * Lets the tabs of a room get its document onto the server as it is now. The saver uploads when
 * asked; anyone else asks the room, after the edits it sent, and the saver answers once the
 * upload is done, so the server holds everything that reached the saver before the question.
 */
export function shareRoomUploads(
  [send, receive]: CollabAction,
  options: {
    /** Whether this tab saves the room's document. */
    saving: () => boolean
    upload: () => Promise<boolean>
    timeoutMs?: number
  }
) {
  const { saving, upload, timeoutMs = ROOM_UPLOAD_TIMEOUT_MS } = options
  const waiting = new Map<string, (uploaded: boolean) => void>()

  receive((data, peerId) => {
    const parsed = v.safeParse(UploadMessageSchema, decoder.decode(data))
    if (!parsed.success) return
    const message = parsed.output
    if (message.type === 'reply') {
      waiting.get(message.id)?.(message.uploaded)
      return
    }
    if (!saving()) return
    void upload()
      .catch(() => false)
      .then((uploaded) => send(encode({ type: 'reply', id: message.id, uploaded }), peerId))
  })

  function ask(): Promise<boolean> {
    const request = crypto.randomUUID()
    const answer = new Promise<boolean>((resolve) => {
      waiting.set(request, resolve)
    })
    const timer = setTimeout(() => waiting.get(request)?.(false), timeoutMs)
    // Edits made in this task reach the room in a microtask; the question has to follow them.
    queueMicrotask(() => send(encode({ type: 'request', id: request })))
    return answer.finally(() => {
      clearTimeout(timer)
      waiting.delete(request)
    })
  }

  return {
    /** Whether the room's document is on the server with every edit this tab has seen. */
    upload: () => (saving() ? upload() : ask()),
    stop() {
      for (const answer of waiting.values()) answer(false)
    }
  }
}
