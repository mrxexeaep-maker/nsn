import { beforeEach, expect, test } from 'bun:test'

import type { UIMessage } from 'ai'
import * as v from 'valibot'

import { chatTrace } from '@/app/ai/chat/history/trace'
import type { Conversation } from '@/app/ai/chat/history/types'
import { diagnostics, recordChatCompleted, recordModelStepCompleted } from '@/app/diagnostics'

const TraceJSON = v.pipe(
  v.string(),
  v.parseJson(),
  v.object({
    environment: v.object({ app: v.string(), shell: v.string() }),
    conversation: v.record(v.string(), v.unknown()),
    messages: v.array(
      v.object({ message: v.looseObject({ id: v.string(), parts: v.array(v.unknown()) }) })
    ),
    events: v.array(v.object({ name: v.string(), sessionId: v.optional(v.string()) }))
  })
)

const conversation: Conversation = {
  id: 'conversation-one',
  documentId: 'document',
  documentName: 'Untitled',
  title: 'Queue screen',
  titleSource: 'manual',
  createdAt: '2026-10-13T10:00:00.000Z',
  updatedAt: '2026-10-13T10:05:00.000Z',
  profileId: null,
  backend: 'direct',
  interrupted: false,
  messages: []
}

const messages: UIMessage[] = [
  { id: 'request', role: 'user', parts: [{ type: 'text', text: 'Add a queue screen' }] },
  {
    id: 'reply',
    role: 'assistant',
    parts: [
      { type: 'reasoning', text: 'Reading the player first.' },
      {
        type: 'tool-eval',
        toolCallId: 'call-1',
        state: 'output-available',
        input: { code: 'figma.currentPage.children.length' },
        output: { result: 3 }
      },
      { type: 'text', text: 'Added the queue screen.' }
    ]
  }
]

beforeEach(async () => {
  await diagnostics.clear()
})

test('a trace keeps every message part and its conversation’s events in order', async () => {
  const run = { sessionId: conversation.id, runId: 'run-one' }
  recordModelStepCompleted(
    {
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.6',
      inputTokens: 10,
      outputTokens: 2,
      cacheReadTokens: null,
      cacheWriteTokens: null
    },
    run
  )
  recordChatCompleted({ finishReason: 'stop' }, run)
  recordChatCompleted({ finishReason: 'stop' }, { sessionId: 'another', runId: 'run-two' })

  const trace = v.parse(TraceJSON, await chatTrace(conversation, messages))

  expect(trace.conversation).toMatchObject({ id: conversation.id, title: 'Queue screen' })
  expect(trace.conversation).not.toHaveProperty('messages')
  expect<unknown[]>(trace.messages.map((row) => row.message)).toEqual(messages)
  expect(trace.events.map((event) => event.name)).toEqual([
    'model.step.completed',
    'chat.completed'
  ])
  expect(trace.events.every((event) => event.sessionId === conversation.id)).toBe(true)
})
