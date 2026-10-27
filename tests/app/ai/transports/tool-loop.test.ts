import 'fake-indexeddb/auto'
import { expect, spyOn, test } from 'bun:test'

import { APICallError, readUIMessageStream, simulateReadableStream } from 'ai'
import type { UIMessage } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import * as v from 'valibot'

import type { AIProviderID } from '@open-pencil/core/constants'
import { FigmaAPI } from '@open-pencil/core/figma-api'
import type { ToolImageData, ToolImageUploader } from '@open-pencil/core/tools'

import { restoreMessages, snapshotMessages } from '@/app/ai/chat/history/messages'
import { createRunRecorder } from '@/app/ai/chat/trace/recorder'
import type { ThinkingLevel } from '@/app/ai/models/types'
import { modelProviderAdapter } from '@/app/ai/providers/registry'
import { withImageUploads, type ImageUploads } from '@/app/ai/transports/tool-images'
import { createToolLoopTransport } from '@/app/ai/transports/tool-loop'
import * as figmaFactory from '@/app/automation/bridge/figma-factory'
import { createEditorStore } from '@/app/editor/session/create'

import { expectDefined } from '#tests/helpers/assert'
import { memoryTraceStore } from '#tests/helpers/chat/trace-store'
import { MOCK_USAGE } from '#tests/helpers/chat/usage'
import { fetchStub } from '#tests/helpers/fetch'

function replyModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: null,
        chunkDelayInMs: null,
        chunks: [
          { type: 'text-start', id: 'reply' },
          { type: 'text-delta', id: 'reply', delta: 'Done' },
          { type: 'text-end', id: 'reply' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: undefined },
            usage: MOCK_USAGE
          }
        ]
      })
    })
  })
}

async function send(transport: ReturnType<typeof createToolLoopTransport>): Promise<void> {
  const stream = await transport.sendMessages({
    trigger: 'submit-message',
    chatId: 'thinking-level',
    messageId: undefined,
    abortSignal: undefined,
    messages: [{ id: 'user', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }]
  })
  const reader = stream.getReader()
  try {
    while (!(await reader.read()).done);
  } finally {
    reader.releaseLock()
  }
}

test('each message uses the thinking level chosen when it is sent', async () => {
  const store = createEditorStore()
  const model = replyModel()
  let level: ThinkingLevel = 'high'
  try {
    const transport = createToolLoopTransport({
      store,
      providerID: 'anthropic',
      model,
      effectiveModelID: 'claude-test',
      maxOutputTokens: 100,
      thinkingLevel: () => level
    })
    await send(transport)
    level = 'off'
    await send(transport)
    level = 'default'
    await send(transport)
    expect(model.doStreamCalls.map((call) => call.reasoning)).toEqual(['high', 'none', undefined])
    // Prompt caching survives alongside the reasoning level.
    expect(model.doStreamCalls[0]?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } }
    })
  } finally {
    store.dispose()
  }
})

test('OpenRouter receives the level as its own reasoning option', async () => {
  const store = createEditorStore()
  const model = replyModel()
  try {
    const transport = createToolLoopTransport({
      store,
      providerID: 'openrouter',
      model,
      effectiveModelID: 'openai/gpt-test',
      maxOutputTokens: 100,
      thinkingLevel: () => 'minimal'
    })
    await send(transport)
    expect(model.doStreamCalls[0]?.providerOptions).toEqual({
      openrouter: { reasoning: { effort: 'minimal' } }
    })
  } finally {
    store.dispose()
  }
})

const RequestBody = v.pipe(v.string(), v.parseJson(), v.record(v.string(), v.unknown()))

/** Sends one message through the provider's real SDK model and returns the request it serialized,
 * checking that the run's trace reports caching as sent. */
async function serializedRequest(
  providerID: AIProviderID,
  modelID: string,
  level: ThinkingLevel
): Promise<Record<string, unknown>> {
  const bodies: unknown[] = []
  const model = modelProviderAdapter(providerID).create(
    {
      providerID,
      apiKey: 'synthetic-unused-key',
      modelID,
      customModelID: '',
      customBaseURL: 'https://compatible.invalid/v1',
      customAPIType: 'completions'
    },
    {
      fetch: fetchStub(async (_input, init) => {
        bodies.push(init?.body)
        throw new Error('Request intercepted')
      })
    }
  )
  const store = createEditorStore()
  const traces = memoryTraceStore()
  const recorder = createRunRecorder(traces.store)
  // The SDK logs the intercepted request's failure.
  const consoleError = spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    await send(
      createToolLoopTransport({
        store,
        providerID,
        model,
        effectiveModelID: modelID,
        maxOutputTokens: 100,
        thinkingLevel: () => level,
        diagnosticContext: { sessionId: 'conversation', runId: 'run' },
        recorder
      })
    )
  } finally {
    consoleError.mockRestore()
    store.dispose()
  }
  await recorder.flush()
  expect(bodies).toHaveLength(1)
  const body = v.parse(RequestBody, bodies[0])
  // The trace reports caching only when the request carries it.
  expect(expectDefined(traces.runs.get('run')).settings.cache).toBe('cache_control' in body)
  return body
}

const EPHEMERAL = { type: 'ephemeral' }

test('Claude on OpenRouter is cached alongside a non-default reasoning effort', async () => {
  const body = await serializedRequest('openrouter', 'anthropic/claude-sonnet-4.6', 'low')
  expect(body.cache_control).toEqual(EPHEMERAL)
  expect(body.reasoning).toEqual({ effort: 'low' })
})

test('Claude on OpenRouter is cached at the default reasoning effort', async () => {
  const body = await serializedRequest('openrouter', 'anthropic/claude-sonnet-4.6', 'default')
  expect(body.cache_control).toEqual(EPHEMERAL)
  expect(body.reasoning).toBeUndefined()
})

test('OpenRouter models with automatic caching get no cache marker', async () => {
  const body = await serializedRequest('openrouter', 'openai/gpt-5.2', 'high')
  expect(body.cache_control).toBeUndefined()
  expect(body.reasoning).toEqual({ effort: 'high' })
})

test.each(['anthropic', 'anthropic-compatible'] as const)(
  '%s requests are cached alongside extended thinking',
  async (providerID) => {
    const body = await serializedRequest(providerID, 'claude-sonnet-4-5', 'high')
    expect(body.cache_control).toEqual(EPHEMERAL)
    expect(body.thinking).toMatchObject({ type: 'enabled' })
  }
)

test('Z.AI caches automatically and gets no cache marker', async () => {
  const body = await serializedRequest('zai', 'glm-4.6', 'default')
  expect(body.cache_control).toBeUndefined()
})

type StreamChunk =
  Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer Chunk>
    ? Chunk
    : never

const EXPORT_STEP: StreamChunk[] = [
  { type: 'tool-call', toolCallId: 'export', toolName: 'export_image', input: '{}' },
  { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: MOCK_USAGE }
]
const REPLY_STEP: StreamChunk[] = [
  { type: 'text-start', id: 'reply' },
  { type: 'text-delta', id: 'reply', delta: 'Looks right' },
  { type: 'text-end', id: 'reply' },
  { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: MOCK_USAGE }
]

function scriptedModel(steps: StreamChunk[][]) {
  let call = 0
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: null,
        chunkDelayInMs: null,
        chunks: steps[call++] ?? []
      })
    })
  })
}

function sentFiles(model: MockLanguageModelV4, call: number) {
  return expectDefined(model.doStreamCalls[call]).prompt.flatMap((message) =>
    message.role === 'tool'
      ? message.content.flatMap((part) =>
          part.type === 'tool-result' && part.output.type === 'content'
            ? part.output.value.filter((item) => item.type === 'file')
            : []
        )
      : []
  )
}

async function reply(
  transport: ReturnType<typeof createToolLoopTransport>,
  messages: UIMessage[]
): Promise<UIMessage> {
  const stream = await transport.sendMessages({
    trigger: 'submit-message',
    chatId: 'images',
    messageId: undefined,
    abortSignal: undefined,
    messages
  })
  let last: UIMessage | undefined
  for await (const message of readUIMessageStream({ stream })) last = message
  return expectDefined(last)
}

test('an exported image reaches the model by reference on later steps and once reopened', async () => {
  const store = createEditorStore()
  store.preparationController.acknowledgePresentation(Number.MAX_SAFE_INTEGER)
  const seed = new FigmaAPI(store.graph)
  seed.currentPage = seed.wrapNode(store.state.currentPageId)
  seed.createRectangle()
  const factory = spyOn(figmaFactory, 'makeFigmaFromStore').mockImplementation((editor) => {
    const api = new FigmaAPI(editor.graph)
    api.currentPage = api.wrapNode(editor.state.currentPageId)
    api.exportImage = async () => new Uint8Array([137, 80, 78, 71])
    return api
  })
  const uploads: string[] = []
  const uploader = (scope: string): ToolImageUploader => ({
    scope,
    async upload({ mediaType }) {
      uploads.push(mediaType)
      return { reference: { anthropic: 'file_1' } }
    }
  })
  const transport = (model: MockLanguageModelV4, imageUploader: ToolImageUploader) =>
    createToolLoopTransport({
      store,
      providerID: 'anthropic',
      model,
      effectiveModelID: 'claude-test',
      maxOutputTokens: 100,
      thinkingLevel: () => 'default',
      imageUploader
    })
  const byReference = {
    type: 'file',
    mediaType: 'image/png',
    data: { type: 'reference', reference: { anthropic: 'file_1' } }
  } as const
  try {
    const request: UIMessage = {
      id: 'request',
      role: 'user',
      parts: [{ type: 'text', text: 'Export the page' }]
    }
    const first = scriptedModel([EXPORT_STEP, REPLY_STEP])
    const answer = await reply(transport(first, uploader('connection')), [request])
    expect(sentFiles(first, 1)).toEqual([byReference])

    const saved = restoreMessages(structuredClone(snapshotMessages([request, answer])))
    const followUp: UIMessage = {
      id: 'follow-up',
      role: 'user',
      parts: [{ type: 'text', text: 'And now?' }]
    }
    const reopened = scriptedModel([REPLY_STEP])
    await reply(transport(reopened, uploader('connection')), [...saved, followUp])
    expect(sentFiles(reopened, 0)).toEqual([byReference])

    const moved = scriptedModel([REPLY_STEP])
    await reply(transport(moved, uploader('other-connection')), [...saved, followUp])
    expect(sentFiles(moved, 0)).toMatchObject([{ mediaType: 'image/png', data: { type: 'data' } }])
    expect(uploads).toEqual(['image/png'])
  } finally {
    factory.mockRestore()
    store.dispose()
  }
})

/** A conversation whose earlier export was uploaded as `file_old`, then a new question. */
function withUploadedExport(expiresAt: string): UIMessage[] {
  return [
    { id: 'ask', role: 'user', parts: [{ type: 'text', text: 'Export the page' }] },
    {
      id: 'answer',
      role: 'assistant',
      parts: [
        {
          type: 'tool-export_image',
          toolCallId: 'export',
          state: 'output-available',
          input: {},
          output: {
            mimeType: 'image/png',
            base64: 'iVBORw==',
            upload: { scope: 'connection', reference: { anthropic: 'file_old' }, expiresAt }
          }
        },
        { type: 'text', text: 'Looks right' }
      ]
    },
    { id: 'follow-up', role: 'user', parts: [{ type: 'text', text: 'And now?' }] }
  ]
}

function uploadingAs(id: string, uploads: ToolImageData[]): ToolImageUploader {
  return {
    scope: 'connection',
    async upload(image) {
      uploads.push(image)
      return { reference: { anthropic: id }, expiresAt: '2099-01-01T00:00:00Z' }
    }
  }
}

function imageTransport(
  model: MockLanguageModelV4,
  imageUploader: ToolImageUploader,
  updateToolOutputs?: (outputs: ImageUploads) => void
) {
  return createToolLoopTransport({
    store: createEditorStore(),
    providerID: 'anthropic',
    model,
    effectiveModelID: 'claude-test',
    maxOutputTokens: 100,
    thinkingLevel: () => 'default',
    imageUploader,
    updateToolOutputs
  })
}

const NEW_FILE = {
  type: 'file',
  mediaType: 'image/png',
  data: { type: 'reference', reference: { anthropic: 'file_new' } }
} as const

test('an expired file is uploaded again from the image the result keeps, once', async () => {
  const uploads: ToolImageData[] = []
  const model = scriptedModel([REPLY_STEP, REPLY_STEP])
  const transport = imageTransport(model, uploadingAs('file_new', uploads))
  const messages = withUploadedExport('2020-01-01T00:00:00Z')
  await reply(transport, messages)
  await reply(transport, messages)
  expect(sentFiles(model, 0)).toEqual([NEW_FILE])
  expect(sentFiles(model, 1)).toEqual([NEW_FILE])
  expect(uploads).toEqual([{ data: 'iVBORw==', mediaType: 'image/png' }])
})

test('a file uploaded again is kept with the chat, so the next session does not upload it', async () => {
  const uploads: ToolImageData[] = []
  let saved = withUploadedExport('2020-01-01T00:00:00Z')
  const keep = (outputs: ImageUploads) => {
    saved = withImageUploads(saved, outputs)
  }
  const first = scriptedModel([REPLY_STEP])
  await reply(imageTransport(first, uploadingAs('file_new', uploads), keep), saved)
  const reopened = scriptedModel([REPLY_STEP])
  await reply(
    imageTransport(reopened, uploadingAs('file_newer', uploads), keep),
    restoreMessages(structuredClone(snapshotMessages(saved)))
  )
  expect(sentFiles(first, 0)).toEqual([NEW_FILE])
  expect(sentFiles(reopened, 0)).toEqual([NEW_FILE])
  expect(uploads).toHaveLength(1)
})

test('a file is uploaded again within the hour before it expires, and not earlier', async () => {
  const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()
  const soon: ToolImageData[] = []
  await reply(
    imageTransport(scriptedModel([REPLY_STEP]), uploadingAs('file_new', soon)),
    withUploadedExport(inMinutes(30))
  )
  const later: ToolImageData[] = []
  const model = scriptedModel([REPLY_STEP])
  await reply(
    imageTransport(model, uploadingAs('file_new', later)),
    withUploadedExport(inMinutes(90))
  )
  expect(soon).toHaveLength(1)
  expect(later).toHaveLength(0)
  expect(sentFiles(model, 0)).toMatchObject([{ data: { reference: { anthropic: 'file_old' } } }])
})

/** A model that answers each call in turn, with a 404 for the file named, else a reply. */
function modelMissing(...missing: Array<string | undefined>) {
  let call = 0
  return new MockLanguageModelV4({
    doStream: async () => {
      const id = missing[call++]
      if (id) {
        throw new APICallError({
          message: `File \`${id}\` not found.`,
          url: 'https://api.anthropic.com/v1/messages',
          requestBodyValues: {},
          statusCode: 404
        })
      }
      return {
        stream: simulateReadableStream({
          initialDelayInMs: null,
          chunkDelayInMs: null,
          chunks: REPLY_STEP
        })
      }
    }
  })
}

test('a file the provider no longer has is uploaded again and the call made once more', async () => {
  const uploads: ToolImageData[] = []
  const model = modelMissing('file_old')
  const answer = await reply(
    imageTransport(model, uploadingAs('file_new', uploads)),
    withUploadedExport('2099-01-01T00:00:00Z')
  )
  expect(sentFiles(model, 0)).toMatchObject([{ data: { reference: { anthropic: 'file_old' } } }])
  expect(sentFiles(model, 1)).toEqual([NEW_FILE])
  expect(uploads).toHaveLength(1)
  expect(answer.parts).toContainEqual(expect.objectContaining({ text: 'Looks right' }))
})

test('a file uploaded again that goes missing too is replaced in every later request', async () => {
  const ids = ['file_new1', 'file_new2']
  const model = modelMissing('file_old', undefined, 'file_new1', undefined, undefined)
  const transport = imageTransport(model, {
    scope: 'connection',
    upload: async () => ({ reference: { anthropic: ids.shift() ?? 'file_extra' } })
  })
  const messages = withUploadedExport('2099-01-01T00:00:00Z')
  await reply(transport, messages)
  await reply(transport, messages)
  await reply(transport, messages)
  expect(sentFiles(model, 3)).toMatchObject([{ data: { reference: { anthropic: 'file_new2' } } }])
  expect(sentFiles(model, 4)).toMatchObject([{ data: { reference: { anthropic: 'file_new2' } } }])
  expect(ids).toEqual([])
})

test('an expired file goes as data when it cannot be uploaded again', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => undefined)
  try {
    const model = scriptedModel([REPLY_STEP])
    await reply(
      imageTransport(model, {
        scope: 'connection',
        upload: async () => {
          throw new Error('files API unavailable')
        }
      }),
      withUploadedExport('2020-01-01T00:00:00Z')
    )
    expect(sentFiles(model, 0)).toMatchObject([{ data: { type: 'data', data: 'iVBORw==' } }])
  } finally {
    warn.mockRestore()
  }
})
