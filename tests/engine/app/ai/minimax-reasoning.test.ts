import { describe, expect, test } from 'bun:test'

import { reasoningCallSettings } from '@/app/ai/chat/reasoning'

describe('MiniMax Flash reasoning', () => {
  test('keeps the default unset and maps unsupported effort to low', () => {
    expect(reasoningCallSettings('minimax', 'default', 'MiniMax-M3.1-Flash')).toEqual({})
    for (const level of ['off', 'minimal'] as const) {
      expect(reasoningCallSettings('minimax', level, 'MiniMax-M3.1-Flash')).toEqual({
        reasoning: 'low'
      })
    }
    for (const level of ['low', 'medium', 'high', 'xhigh'] as const) {
      expect(reasoningCallSettings('minimax', level, 'MiniMax-M3.1-Flash')).toEqual({
        reasoning: level
      })
    }
  })

  test('preserves M3, legacy, custom endpoint, and gateway behavior', () => {
    for (const id of ['MiniMax-M3', 'MiniMax-M2.7', 'my-model']) {
      expect(reasoningCallSettings('minimax', 'off', id)).toEqual({ reasoning: 'none' })
    }
    expect(reasoningCallSettings('openai-compatible', 'off', 'MiniMax-M3.1-Flash')).toEqual({
      reasoning: 'none'
    })
    expect(reasoningCallSettings('openrouter', 'low', 'minimax/minimax-m3.1-flash:free')).toEqual({
      providerOptions: { openrouter: { reasoning: { effort: 'low' } } }
    })
  })
})
