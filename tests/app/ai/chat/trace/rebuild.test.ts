import 'fake-indexeddb/auto'
import { afterEach, expect, spyOn, test } from 'bun:test'

import { readUIMessageStream, simulateReadableStream } from 'ai'
import type { UIMessage } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'

import { FigmaAPI } from '@open-pencil/core/figma-api'
import type { ToolImageUploader } from '@open-pencil/core/tools'

import { matchesRecordedStep, rebuildStepMessages } from '@/app/ai/chat/trace/rebuild'
import { createRunRecorder } from '@/app/ai/chat/trace/recorder'
import { createAITools } from '@/app/ai/tools'
import { aiToolOverrides } from '@/app/ai/tools/preferences'
import { withImageUploads } from '@/app/ai/transports/tool-images'
import { createToolLoopTransport } from '@/app/ai/transports/tool-loop'
import * as figmaFactory from '@/app/automation/bridge/figma-factory'
import { createEditorStore } from '@/app/editor/session/create'

import { expectDefined } from '#tests/helpers/assert'
import { memoryTraceStore } from '#tests/helpers/chat/trace-store'
import { MOCK_USAGE } from '#tests/helpers/chat/usage'

type StreamChunk =
  Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer Chunk>
    ? Chunk
    : never

const rectangle = (id: string, x: number): StreamChunk[] => [
  {
    type: 'tool-call',
    toolCallId: id,
    toolName: 'create_shape',
    input: JSON.stringify({ type: 'RECTANGLE', x, y: 0, width: 10, height: 10 })
  },
  { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: MOCK_USAGE }
]

const STEPS: StreamChunk[][] = [
  rectangle('call-a', 0),
  [
    { type: 'reasoning-start', id: 'think' },
    { type: 'reasoning-delta', id: 'think', delta: 'One more beside it.' },
    { type: 'reasoning-end', id: 'think' },
    ...rectangle('call-b', 20)
  ],
  [
    { type: 'text-start', id: 'reply' },
    { type: 'text-delta', id: 'reply', delta: 'Drew two rectangles.' },
    { type: 'text-end', id: 'reply' },
    { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: MOCK_USAGE }
  ]
]

const previousTools = aiToolOverrides.value
afterEach(() => {
  aiToolOverrides.value = previousTools
})

test('every recorded step rebuilds from the conversation to the request the model received', async () => {
  const store = createEditorStore()
  spyOn(figmaFactory, 'makeFigmaFromStore').mockImplementation((editor, pageId) => {
    const api = new FigmaAPI(editor.graph)
    api.currentPage = api.wrapNode(pageId ?? editor.state.currentPageId)
    return api
  })
  store.preparationController.acknowledgePresentation(Number.MAX_SAFE_INTEGER)
  aiToolOverrides.value = { create_shape: true }

  let call = 0
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream<StreamChunk>({
        initialDelayInMs: null,
        chunkDelayInMs: null,
        chunks: STEPS[call++] ?? []
      })
    })
  })
  const traces = memoryTraceStore()
  const recorder = createRunRecorder(traces.store)
  const transport = createToolLoopTransport({
    store,
    providerID: 'openai',
    model,
    effectiveModelID: 'test',
    maxOutputTokens: 100,
    thinkingLevel: () => 'default',
    diagnosticContext: { sessionId: 'conversation', runId: 'run' },
    recorder
  })
  const earlier: UIMessage[] = [
    { id: 'first', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
    { id: 'answer', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] },
    { id: 'request', role: 'user', parts: [{ type: 'text', text: 'Draw two rectangles' }] }
  ]
  const stream = await transport.sendMessages({
    trigger: 'submit-message',
    chatId: 'conversation',
    messageId: undefined,
    abortSignal: undefined,
    messages: earlier
  })
  let reply: UIMessage | undefined
  for await (const message of readUIMessageStream({ stream })) reply = message
  await recorder.flush()

  const run = expectDefined(traces.runs.get('run'))
  expect(run.outcome).toBe('completed')
  expect(run.input).toEqual({ through: 'request', messages: 3 })
  expect(run.steps.map((step) => step.response.finishReason)).toEqual([
    'tool-calls',
    'tool-calls',
    'stop'
  ])
  expect(traces.assets.get(run.instructions)?.kind).toBe('instructions')
  expect(traces.assets.get(expectDefined(run.tools))).toMatchObject({
    kind: 'tools',
    tools: expect.arrayContaining([expect.objectContaining({ name: 'create_shape' })])
  })

  const conversation = [...earlier, expectDefined(reply)]
  const tools = createAITools(store)
  for (const step of run.steps) {
    expect(await matchesRecordedStep(conversation, run, step.index, tools)).toBe(true)
  }
  expect(run.steps.map((step) => step.request.messages)).toEqual([3, 5, 7])
  // A conversation that changed since no longer rebuilds to what was sent.
  const edited = conversation.with(2, {
    id: 'request',
    role: 'user',
    parts: [{ type: 'text', text: 'Draw three rectangles' }]
  })
  expect(await matchesRecordedStep(edited, run, 0, tools)).toBe(false)
  // The last step saw both tool calls and their results.
  const last = await rebuildStepMessages(conversation, run, 2, tools)
  expect(last.filter((message) => message.role === 'tool')).toHaveLength(2)
})

test('a step that sent an exported image by reference rebuilds to that reference', async () => {
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
  const imageUploader: ToolImageUploader = {
    scope: 'connection',
    upload: async () => ({ reference: { anthropic: 'file_1' } })
  }
  const steps: StreamChunk[][] = [
    [
      { type: 'tool-call', toolCallId: 'export', toolName: 'export_image', input: '{}' },
      { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: MOCK_USAGE }
    ],
    STEPS[2] ?? []
  ]
  let call = 0
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream<StreamChunk>({
        initialDelayInMs: null,
        chunkDelayInMs: null,
        chunks: steps[call++] ?? []
      })
    })
  })
  const traces = memoryTraceStore()
  const recorder = createRunRecorder(traces.store)
  try {
    const request: UIMessage = {
      id: 'request',
      role: 'user',
      parts: [{ type: 'text', text: 'Export the page' }]
    }
    const stream = await createToolLoopTransport({
      store,
      providerID: 'anthropic',
      model,
      effectiveModelID: 'test',
      maxOutputTokens: 100,
      thinkingLevel: () => 'default',
      diagnosticContext: { sessionId: 'conversation', runId: 'run' },
      recorder,
      imageUploader
    }).sendMessages({
      trigger: 'submit-message',
      chatId: 'conversation',
      messageId: undefined,
      abortSignal: undefined,
      messages: [request]
    })
    let reply: UIMessage | undefined
    for await (const message of readUIMessageStream({ stream })) reply = message
    await recorder.flush()

    const run = expectDefined(traces.runs.get('run'))
    const conversation = [request, expectDefined(reply)]
    expect(
      await matchesRecordedStep(
        conversation,
        run,
        1,
        createAITools(store, undefined, imageUploader)
      )
    ).toBe(true)
    expect(await matchesRecordedStep(conversation, run, 1, createAITools(store))).toBe(false)
  } finally {
    factory.mockRestore()
    store.dispose()
  }
})

test('a step sent after an expired file was uploaded again rebuilds from the kept chat', async () => {
  const store = createEditorStore()
  const imageUploader: ToolImageUploader = {
    scope: 'connection',
    upload: async () => ({
      reference: { anthropic: 'file_new' },
      expiresAt: '2099-01-01T00:00:00Z'
    })
  }
  const earlier: UIMessage[] = [
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
            upload: {
              scope: 'connection',
              reference: { anthropic: 'file_old' },
              expiresAt: '2020-01-01T00:00:00Z'
            }
          }
        }
      ]
    },
    { id: 'request', role: 'user', parts: [{ type: 'text', text: 'And now?' }] }
  ]
  let kept = earlier
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream<StreamChunk>({
        initialDelayInMs: null,
        chunkDelayInMs: null,
        chunks: STEPS[2] ?? []
      })
    })
  })
  const traces = memoryTraceStore()
  const recorder = createRunRecorder(traces.store)
  try {
    const stream = await createToolLoopTransport({
      store,
      providerID: 'anthropic',
      model,
      effectiveModelID: 'test',
      maxOutputTokens: 100,
      thinkingLevel: () => 'default',
      diagnosticContext: { sessionId: 'conversation', runId: 'run' },
      recorder,
      imageUploader,
      updateToolOutputs: (outputs) => {
        kept = withImageUploads(kept, outputs)
      }
    }).sendMessages({
      trigger: 'submit-message',
      chatId: 'conversation',
      messageId: undefined,
      abortSignal: undefined,
      messages: earlier
    })
    let reply: UIMessage | undefined
    for await (const message of readUIMessageStream({ stream })) reply = message
    await recorder.flush()

    const run = expectDefined(traces.runs.get('run'))
    const tools = createAITools(store, undefined, imageUploader)
    expect(await matchesRecordedStep([...kept, expectDefined(reply)], run, 0, tools)).toBe(true)
    expect(await matchesRecordedStep([...earlier, expectDefined(reply)], run, 0, tools)).toBe(false)
  } finally {
    store.dispose()
  }
})
