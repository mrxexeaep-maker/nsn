import { describe, expect, test } from 'bun:test'

import { currentMiniMaxModels } from '@/app/ai/models/catalog/minimax'

const model = (id: string) => ({ id, name: id })

describe('MiniMax text discovery', () => {
  test('keeps Flash first and M3, without mutating cached entries', () => {
    const entries = ['MiniMax-M2.7', 'MiniMax-M3', 'MiniMax-M3.1-Flash', 'MiniMax-M2'].map(model)
    expect(currentMiniMaxModels('minimax', entries).map(({ id }) => id)).toEqual([
      'MiniMax-M3.1-Flash',
      'MiniMax-M3'
    ])
    expect(entries.map(({ id }) => id)).toEqual([
      'MiniMax-M2.7',
      'MiniMax-M3',
      'MiniMax-M3.1-Flash',
      'MiniMax-M2'
    ])
  })

  test('uses the verified OpenRouter free route and preserves other providers and metadata', () => {
    const other = { ...model('anthropic/claude-sonnet-4.6'), recommendedMaxOutputTokens: 8192 }
    const flash = {
      ...model('minimax/minimax-m3.1-flash:free'),
      capabilities: ['tools', 'vision'] as ('tools' | 'vision')[],
      recommendedMaxOutputTokens: 4096
    }
    const m3 = model('minimax/minimax-m3')
    const speech = model('minimax/speech-02')
    expect(
      currentMiniMaxModels('openrouter', [
        model('minimax/minimax-m2.7'),
        m3,
        other,
        speech,
        model('minimax/minimax-m3.1-flash'),
        flash
      ])
    ).toEqual([other, speech, flash, m3])
  })

  test('does not invent missing gateway entries or filter custom endpoints', () => {
    const entries = [model('MiniMax-M2.7'), model('my-private-model')]
    expect(currentMiniMaxModels('openai-compatible', entries)).toBe(entries)
    expect(currentMiniMaxModels('openrouter', [model('minimax/minimax-m3')])).toEqual([
      model('minimax/minimax-m3')
    ])
  })
})
