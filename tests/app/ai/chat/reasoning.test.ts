import { describe, expect, test } from 'bun:test'

import { reasoningCallSettings } from '@/app/ai/chat/reasoning'

describe('reasoningCallSettings', () => {
  test('maps thinking levels to the AI SDK reasoning option', () => {
    expect(reasoningCallSettings('anthropic', 'claude-sonnet-5-5', 'high')).toEqual({
      reasoning: 'high'
    })
    expect(reasoningCallSettings('google', 'gemini-3.8-flash', 'off')).toEqual({
      reasoning: 'none'
    })
    expect(reasoningCallSettings('openai-compatible', 'my-model', 'xhigh')).toEqual({
      reasoning: 'xhigh'
    })
    expect(reasoningCallSettings('openrouter', 'anthropic/claude-sonnet-5.5', 'low')).toEqual({
      providerOptions: { openrouter: { reasoning: { effort: 'low' } } }
    })
    expect(reasoningCallSettings('anthropic', 'claude-sonnet-5-5', 'default')).toEqual({})
  })

  test('raises levels below a model’s lowest supported effort', () => {
    const flash = (level: Parameters<typeof reasoningCallSettings>[2]) =>
      reasoningCallSettings('minimax', 'MiniMax-M3.1-Flash', level)
    expect(flash('default')).toEqual({})
    expect(flash('off')).toEqual({ reasoning: 'low' })
    expect(flash('minimal')).toEqual({ reasoning: 'low' })
    expect(flash('medium')).toEqual({ reasoning: 'medium' })
    expect(reasoningCallSettings('minimax', 'MiniMax-M3', 'off')).toEqual({ reasoning: 'none' })
  })
})
