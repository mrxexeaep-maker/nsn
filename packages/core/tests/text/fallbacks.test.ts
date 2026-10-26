import { describe, expect, test } from 'bun:test'

import {
  collectGraphFontRequirements,
  fontFallbackScriptForCharacter
} from '@open-pencil/core/text'
import { SceneGraph } from '@open-pencil/scene-graph'

describe('fallback scripts', () => {
  test('cover every character of the scripts they draw', () => {
    // Hangul jamo, half-width katakana, and an Arabic letter from the Extended-B block.
    expect(['ᄀ', 'ｱ', 'ࡰ'].map((char) => fontFallbackScriptForCharacter(char))).toEqual([
      'cjk-kr',
      'cjk-jp',
      'arabic'
    ])
  })

  test('are the ones a document loads fonts for', () => {
    const graph = new SceneGraph()
    const text = graph.createNode('TEXT', graph.getPages()[0].id, {
      text: '萬',
      fontFamily: 'Inter'
    })
    // A Traditional-only character draws in the Traditional Chinese fallback, so that one loads.
    expect(collectGraphFontRequirements(graph, [text.id]).scripts).toEqual([
      fontFallbackScriptForCharacter('萬')
    ])
    expect(fontFallbackScriptForCharacter('萬')).toBe('cjk-tc')
  })
})
