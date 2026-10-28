import { APICallError, isToolUIPart, type LanguageModelMiddleware, type UIMessage } from 'ai'
import { forEachAsync, isPlainObject, uniq } from 'es-toolkit'
import { toRaw } from 'vue'

import {
  readToolImage,
  type ToolImageData,
  type ToolImageFile,
  type ToolImageUploader
} from '@open-pencil/core/tools'

import { missingFileIds } from '@/app/ai/chat/failure'

type CallOptions = Parameters<NonNullable<LanguageModelMiddleware['transformParams']>>[0]['params']
type FileData =
  | { type: 'reference'; reference: ToolImageFile['reference'] }
  | { type: 'data'; data: string }

/** An image the conversation sent by file id, and the tool call whose result keeps it. */
type Sent = { image: ToolImageData; expiresAt?: string; toolCallId?: string }

/** The new upload of each tool result whose image was uploaded again, by tool call id. */
export type ImageUploads = ReadonlyMap<string, ToolImageFile & { scope: string }>

/** A file is uploaded again this long before it expires, so no request names it as it goes. */
const EXPIRY_MARGIN_MS = 60 * 60 * 1000
/** Uploads at once; Orbit's proxy shares one request limit between uploads and messages. */
const UPLOAD_CONCURRENCY = 4
/** What an endpoint without a files API answers an upload with. */
const NO_FILES_API = new Set([404, 405, 501])

function fileIds(params: CallOptions): string[] {
  return params.prompt.flatMap((message) =>
    message.role === 'tool'
      ? message.content.flatMap((part) =>
          part.type === 'tool-result' && part.output.type === 'content'
            ? part.output.value.flatMap((item) =>
                item.type === 'file' && item.data.type === 'reference'
                  ? Object.values(item.data.reference)
                  : []
              )
            : []
        )
      : []
  )
}

function withFiles(params: CallOptions, replaced: Map<string, FileData>): CallOptions {
  return {
    ...params,
    prompt: params.prompt.map((message) =>
      message.role !== 'tool'
        ? message
        : {
            ...message,
            content: message.content.map((part) =>
              part.type !== 'tool-result' || part.output.type !== 'content'
                ? part
                : {
                    ...part,
                    output: {
                      ...part.output,
                      value: part.output.value.map((item) => {
                        if (item.type !== 'file' || item.data.type !== 'reference') return item
                        const id = Object.values(item.data.reference).find((value) =>
                          replaced.has(value)
                        )
                        const data = id === undefined ? undefined : replaced.get(id)
                        return data ? { ...item, data } : item
                      })
                    }
                  }
            )
          }
    )
  }
}

/**
 * The conversation with each tool result naming its new upload. A message it changes is built
 * from the plain message, since a chat's messages are reactive and a copy carrying Vue proxies
 * cannot be saved.
 */
export function withImageUploads(messages: UIMessage[], uploads: ImageUploads): UIMessage[] {
  return messages.map((message) => {
    if (!message.parts.some((part) => isToolUIPart(part) && uploads.has(part.toolCallId))) {
      return message
    }
    const raw = toRaw(message)
    return {
      ...raw,
      parts: raw.parts.map((part) => {
        if (!isToolUIPart(part) || part.state !== 'output-available') return part
        const upload = uploads.get(part.toolCallId)
        return upload && isPlainObject(part.output)
          ? { ...part, output: { ...part.output, upload } }
          : part
      })
    }
  })
}

/**
 * Keeps the files a chat's images were uploaded as readable by the model. Before a message is
 * sent, an image whose file expires within the hour is uploaded again from the data its tool
 * result keeps, and `onUploadedAgain` gets the new uploads, for the chat to write into its tool
 * results. When the provider answers that files of a request are missing, the call is made
 * once more after uploading them again: the files it names, or, when it names one, as
 * Anthropic names only the first, that file and every image of the request not uploaded since
 * the chat opened. An image that cannot be uploaded goes as data, and once the endpoint shows
 * it has no files API, no image is uploaded again.
 */
export function createToolImageFiles(
  uploader: ToolImageUploader,
  onUploadedAgain?: (uploads: ImageUploads) => void
) {
  const sent = new Map<string, Sent>()
  const fresh = new Set<string>()
  const replaced = new Map<string, FileData>()
  let filesAPI = true

  async function upload(
    image: ToolImageData,
    abortSignal: AbortSignal | undefined
  ): Promise<ToolImageFile | undefined> {
    if (!filesAPI) return undefined
    try {
      const file = await uploader.upload(image, { abortSignal })
      for (const id of Object.values(file?.reference ?? {})) {
        sent.set(id, { image, expiresAt: file?.expiresAt })
        fresh.add(id)
      }
      return file
    } catch (error) {
      if (APICallError.isInstance(error) && NO_FILES_API.has(error.statusCode ?? 0)) {
        filesAPI = false
      }
      throw error
    }
  }

  /** Uploads the files again, and returns the tool results that now name a new file. */
  async function uploadAgain(
    ids: string[],
    abortSignal: AbortSignal | undefined
  ): Promise<ImageUploads> {
    const uploads = new Map<string, ToolImageFile & { scope: string }>()
    await forEachAsync(
      uniq(ids),
      async (id) => {
        const known = sent.get(id)
        // A stopped upload is tried again with the next message, not sent as data.
        if (abortSignal?.aborted || !known || replaced.has(id)) return
        let data: FileData = { type: 'data', data: known.image.data }
        try {
          const file = await upload(known.image, abortSignal)
          if (file) data = { type: 'reference', reference: file.reference }
          if (file && known.toolCallId) {
            uploads.set(known.toolCallId, { scope: uploader.scope, ...file })
          }
        } catch (error) {
          if (abortSignal?.aborted) return
          console.warn('[AI] Sending an image as data, since uploading it again failed:', error)
        }
        // An earlier replacement that pointed at this file now points at its new one.
        for (const [earlier, current] of replaced) {
          if (current.type === 'reference' && Object.values(current.reference).includes(id)) {
            replaced.set(earlier, data)
          }
        }
        replaced.set(id, data)
      },
      { concurrency: UPLOAD_CONCURRENCY }
    )
    if (uploads.size > 0) onUploadedAgain?.(uploads)
    return uploads
  }

  /** Learns the images of a conversation about to be sent. */
  function remember(messages: UIMessage[]): void {
    for (const part of messages.flatMap((message) => message.parts)) {
      if (!isToolUIPart(part) || part.state !== 'output-available') continue
      const image = readToolImage(part.output)
      if (image?.upload?.scope !== uploader.scope) continue
      const { data, mediaType } = image
      for (const id of Object.values(image.upload.reference)) {
        sent.set(id, {
          image: { data, mediaType },
          expiresAt: image.upload.expiresAt,
          toolCallId: part.toolCallId
        })
      }
    }
  }

  /** The uploader for the chat's tools. */
  const toolUploader: ToolImageUploader = {
    scope: uploader.scope,
    upload: (image, options) => upload(image, options?.abortSignal)
  }

  const middleware: LanguageModelMiddleware = {
    specificationVersion: 'v4',
    async transformParams({ params }) {
      return withFiles(params, replaced)
    },
    async wrapStream({ doStream, params, model }) {
      try {
        return await doStream()
      } catch (error) {
        const request = fileIds(params)
        const missing = missingFileIds(error).filter((id) => request.includes(id))
        if (missing.length === 0) throw error
        const stale = missing.length > 1 ? [] : request.filter((id) => !fresh.has(id))
        await uploadAgain([...missing, ...stale], params.abortSignal)
        return model.doStream(withFiles(params, replaced))
      }
    }
  }

  return {
    uploader: toolUploader,
    /**
     * The conversation to send, with every image whose file expires within the hour uploaded
     * again.
     */
    async prepare(messages: UIMessage[], abortSignal?: AbortSignal): Promise<UIMessage[]> {
      remember(messages)
      const due = Date.now() + EXPIRY_MARGIN_MS
      const expiring = [...sent].flatMap(([id, known]) =>
        known.expiresAt !== undefined && Date.parse(known.expiresAt) <= due ? [id] : []
      )
      const uploads = await uploadAgain(expiring, abortSignal)
      return uploads.size > 0 ? withImageUploads(messages, uploads) : messages
    },
    middleware
  }
}
