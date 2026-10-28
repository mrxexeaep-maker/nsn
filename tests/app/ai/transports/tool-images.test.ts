import { expect, spyOn, test } from 'bun:test'

import { APICallError, simulateReadableStream, type UIMessage } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { delay } from 'es-toolkit'
import { ref } from 'vue'

import type { ToolImageData, ToolImageUploader } from '@open-pencil/core/tools'

import { snapshotMessages } from '@/app/ai/chat/history/messages'
import {
  createToolImageFiles,
  withImageUploads,
  type ImageUploads
} from '@/app/ai/transports/tool-images'
import { createDeferred, type Deferred } from '@/app/runtime/deferred'

import { expectDefined } from '#tests/helpers/assert'
import { MOCK_USAGE } from '#tests/helpers/chat/usage'

const SOON = '2020-01-01T00:00:00Z'
const LATER = '2099-01-01T00:00:00Z'

/** A reply that exported one image per file id, each uploaded as that id. */
function exportsUploaded(
  ids: string[],
  expiresAt: string,
  extra: Record<string, unknown> = {}
): UIMessage[] {
  return [
    { id: 'ask', role: 'user', parts: [{ type: 'text', text: 'Export the frames' }] },
    {
      id: 'answer',
      role: 'assistant',
      parts: ids.map((id) => ({
        type: 'tool-export_image' as const,
        toolCallId: `call-${id}`,
        state: 'output-available' as const,
        input: {},
        output: {
          ...extra,
          mimeType: 'image/png',
          base64: `data-${id}`,
          upload: { scope: 'connection', reference: { anthropic: id }, expiresAt }
        }
      }))
    }
  ]
}

function counting(
  uploads: ToolImageData[],
  wait?: (signal: AbortSignal | undefined) => Promise<void>
): ToolImageUploader {
  return {
    scope: 'connection',
    async upload(image, options) {
      uploads.push(image)
      await wait?.(options?.abortSignal)
      return { reference: { anthropic: `new-${uploads.length}` }, expiresAt: LATER }
    }
  }
}

function notFound(...ids: string[]): APICallError {
  return new APICallError({
    message: ids.map((id) => `File \`${id}\` not found.`).join(' '),
    url: 'https://api.anthropic.com/v1/messages',
    requestBodyValues: {},
    statusCode: 404
  })
}

/** A model call whose tool result sends each file by reference. */
function callWith(ids: string[], abortSignal?: AbortSignal) {
  return {
    abortSignal,
    prompt: [
      {
        role: 'tool' as const,
        content: [
          {
            type: 'tool-result' as const,
            toolCallId: 'call',
            toolName: 'export_image',
            output: {
              type: 'content' as const,
              value: ids.map((id) => ({
                type: 'file' as const,
                mediaType: 'image/png',
                data: { type: 'reference' as const, reference: { anthropic: id } }
              }))
            }
          }
        ]
      }
    ]
  }
}

/** Runs one model call through the middleware, the first attempt failing with `error`. */
async function callFailingOnce(
  files: ReturnType<typeof createToolImageFiles>,
  ids: string[],
  error: unknown,
  abortSignal?: AbortSignal
) {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: null,
        chunkDelayInMs: null,
        chunks: [
          { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: MOCK_USAGE }
        ]
      })
    })
  })
  const wrapStream = expectDefined(files.middleware.wrapStream)
  await wrapStream({
    doGenerate: () => model.doGenerate(callWith(ids)),
    doStream: async () => {
      throw error
    },
    params: callWith(ids, abortSignal),
    model
  })
  return model
}

test('an image uploaded again is handed back to keep with its tool result', async () => {
  const kept: ImageUploads[] = []
  const files = createToolImageFiles(counting([]), (uploads) => kept.push(uploads))
  const sent = await files.prepare(exportsUploaded(['old'], SOON))
  const upload = { reference: { anthropic: 'new-1' }, expiresAt: LATER }
  expect(kept).toHaveLength(1)
  expect(expectDefined(kept[0]).get('call-old')).toMatchObject(upload)
  expect(sent[1]?.parts[0]).toMatchObject({ toolCallId: 'call-old', output: { upload } })
})

test('a conversation written back from a Vue ref can still be saved', async () => {
  const bounds = { x: 0, y: 0, width: 2, height: 2 }
  const chat = ref<UIMessage[]>(exportsUploaded(['old'], SOON, { changedBounds: bounds }))
  const files = createToolImageFiles(counting([]), (uploads) => {
    chat.value = withImageUploads(chat.value, uploads)
  })
  await files.prepare(chat.value)
  const saved = snapshotMessages(chat.value)
  expect(saved[1]?.message.parts[0]).toMatchObject({
    output: { changedBounds: bounds, upload: { reference: { anthropic: 'new-1' } } }
  })
})

test('an upload stopped before sending is made again with the next message', async () => {
  const uploads: ToolImageData[] = []
  const files = createToolImageFiles(
    counting(uploads, async (signal) => {
      await new Promise<void>((resolve) => {
        signal?.addEventListener('abort', () => resolve())
        setTimeout(resolve, 20)
      })
      signal?.throwIfAborted()
    })
  )
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']
  const stop = new AbortController()
  const stopped = files.prepare(exportsUploaded(ids, SOON), stop.signal)
  stop.abort()
  await stopped
  const sent = await files.prepare(exportsUploaded(ids, SOON))
  for (const part of expectDefined(sent[1]).parts) {
    expect(part).toMatchObject({ output: { upload: { expiresAt: LATER } } })
  }
})

test('no more than four images are uploaded at once', async () => {
  let active = 0
  let most = 0
  const uploads: ToolImageData[] = []
  const files = createToolImageFiles(
    counting(uploads, async () => {
      most = Math.max(most, ++active)
      await delay(5)
      active--
    })
  )
  await files.prepare(exportsUploaded(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], SOON))
  expect(uploads).toHaveLength(10)
  expect(most).toBe(4)
})

test.each([404, 405, 501])(
  'an endpoint whose upload answers %i is not asked again',
  async (statusCode) => {
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      let attempts = 0
      const files = createToolImageFiles({
        scope: 'connection',
        async upload() {
          attempts++
          throw new APICallError({
            message: 'Not here',
            url: 'https://gateway.example/v1/files',
            requestBodyValues: {},
            statusCode
          })
        }
      })
      const image = { data: 'iVBORw==', mediaType: 'image/png' }
      await expect(files.uploader.upload(image)).rejects.toThrow('Not here')
      expect(await files.uploader.upload(image)).toBeUndefined()
      const sent = await files.prepare(exportsUploaded(['a'], SOON))
      expect(attempts).toBe(1)
      expect(sent[1]?.parts[0]).toMatchObject({
        output: { upload: { reference: { anthropic: 'a' } } }
      })
    } finally {
      warn.mockRestore()
    }
  }
)

/** An uploader that waits for Stop, reporting the signal each upload got. */
function waitingForStop(signals: Array<AbortSignal | undefined>, started: Deferred<undefined>) {
  return counting([], async (signal) => {
    signals.push(signal)
    started.resolve(undefined)
    await new Promise<void>((resolve) => {
      signal?.addEventListener('abort', () => resolve())
      setTimeout(resolve, 50)
    })
    signal?.throwIfAborted()
  })
}

test('stopping the reply cancels the uploads before it is sent', async () => {
  const signals: Array<AbortSignal | undefined> = []
  const started = createDeferred<undefined>()
  const files = createToolImageFiles(waitingForStop(signals, started))
  const stop = new AbortController()
  const preparing = files.prepare(exportsUploaded(['a'], SOON), stop.signal)
  await started.promise
  stop.abort()
  await preparing
  expect(signals.map((signal) => signal?.aborted)).toEqual([true])
})

test('stopping the reply cancels the uploads its retry waits for', async () => {
  const signals: Array<AbortSignal | undefined> = []
  const started = createDeferred<undefined>()
  const files = createToolImageFiles(waitingForStop(signals, started))
  await files.prepare(exportsUploaded(['b'], LATER))
  const stop = new AbortController()
  const calling = callFailingOnce(files, ['b'], notFound('b'), stop.signal)
  await started.promise
  stop.abort()
  await calling
  expect(signals.map((signal) => signal?.aborted)).toEqual([true])
})

test('a 404 naming several files uploads exactly those again', async () => {
  const uploads: ToolImageData[] = []
  const files = createToolImageFiles(counting(uploads))
  await files.prepare(exportsUploaded(['a', 'b', 'c'], LATER))
  const model = await callFailingOnce(files, ['a', 'b', 'c'], notFound('a', 'c'))
  expect(uploads.map((image) => image.data)).toEqual(['data-a', 'data-c'])
  expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain('"anthropic":"b"')
})

test('a 404 naming one file uploads it and every image not uploaded since the chat opened', async () => {
  const uploads: ToolImageData[] = []
  const files = createToolImageFiles(counting(uploads))
  await files.prepare(exportsUploaded(['a', 'b'], LATER))
  await callFailingOnce(files, ['a', 'b'], notFound('a'))
  expect(uploads.map((image) => image.data).toSorted()).toEqual(['data-a', 'data-b'])
})
