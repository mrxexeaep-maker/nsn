import type { UIMessage } from 'ai'
import { omit } from 'es-toolkit/object'

import { diagnostics } from '@/app/diagnostics'
import { diagnosticsEnvironment } from '@/app/diagnostics/environment'

import { snapshotMessages } from './messages'
import type { Conversation } from './types'

/**
 * A conversation as it ran, for debugging a session: every message part as the model saw it
 * (text, reasoning, tool calls with their inputs and outputs), and the diagnostic events of its
 * runs, which carry the model, token usage, and tool timings of each step.
 */
export async function chatTrace(conversation: Conversation, messages: UIMessage[]) {
  const events = (await diagnostics.list()).filter((event) => event.sessionId === conversation.id)
  return JSON.stringify(
    {
      environment: diagnosticsEnvironment(),
      conversation: omit(conversation, ['messages']),
      messages: snapshotMessages(messages),
      events: events.toReversed()
    },
    null,
    2
  )
}
