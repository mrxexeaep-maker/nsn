import type { LanguageModelCallOptions } from 'ai'

import { AI_PROVIDERS } from '@open-pencil/core/constants'
import type { AIProviderID } from '@open-pencil/core/constants'

import { resolveLanguageModelID } from '@/app/ai/chat/model'
import {
  THINKING_LEVELS,
  type ResolvedAIModelRole,
  type ThinkingLevel
} from '@/app/ai/models/types'

type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue }
export type AIProviderOptions = Record<string, { [key: string]: JSONValue }>

export type ReasoningCallSettings = {
  reasoning?: LanguageModelCallOptions['reasoning']
  providerOptions?: AIProviderOptions
}

function minReasoningEffort(providerID: AIProviderID, modelID: string) {
  return AI_PROVIDERS.find((provider) => provider.id === providerID)?.models.find(
    (model) => model.id === modelID
  )?.minReasoningEffort
}

/**
 * AI SDK providers map the standard `reasoning` level to their own thinking options.
 * OpenRouter's provider ignores it, so it receives the equivalent provider option.
 * Models that always reason raise lower levels to the lowest effort they accept.
 */
export function reasoningCallSettings(
  providerID: AIProviderID,
  modelID: string,
  level: ThinkingLevel
): ReasoningCallSettings {
  if (level === 'default') return {}
  const floor = minReasoningEffort(providerID, modelID)
  const effective =
    floor && THINKING_LEVELS.indexOf(level) < THINKING_LEVELS.indexOf(floor) ? floor : level
  const reasoning = effective === 'off' ? 'none' : effective
  if (providerID === 'openrouter') {
    return { providerOptions: { openrouter: { reasoning: { effort: reasoning } } } }
  }
  return { reasoning }
}

/** Reasoning settings for a role's own model and thinking level. */
export function roleReasoningSettings(
  role: Pick<ResolvedAIModelRole, 'connection' | 'profile'>
): ReasoningCallSettings {
  const { providerID } = role.connection
  return reasoningCallSettings(
    providerID,
    resolveLanguageModelID({ providerID, ...role.profile }),
    role.profile.thinkingLevel
  )
}
