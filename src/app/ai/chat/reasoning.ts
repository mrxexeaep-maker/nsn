import type { LanguageModelCallOptions } from 'ai'

import type { AIProviderID } from '@open-pencil/core/constants'

import type { ThinkingLevel } from '@/app/ai/models/types'

type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue }
export type AIProviderOptions = Record<string, { [key: string]: JSONValue }>

export type ReasoningCallSettings = {
  reasoning?: LanguageModelCallOptions['reasoning']
  providerOptions?: AIProviderOptions
}

/**
 * AI SDK providers map the standard `reasoning` level to their own thinking options.
 * OpenRouter's provider ignores it, so it receives the equivalent provider option.
 */
export function reasoningCallSettings(
  providerID: AIProviderID,
  level: ThinkingLevel,
  modelID?: string
): ReasoningCallSettings {
  if (level === 'default') return {}
  // Flash always thinks; use its lowest supported effort for existing off/minimal preferences.
  if (providerID === 'minimax' && modelID === 'MiniMax-M3.1-Flash') {
    return { reasoning: level === 'off' || level === 'minimal' ? 'low' : level }
  }
  const reasoning = level === 'off' ? 'none' : level
  if (providerID === 'openrouter') {
    return { providerOptions: { openrouter: { reasoning: { effort: reasoning } } } }
  }
  return { reasoning }
}
