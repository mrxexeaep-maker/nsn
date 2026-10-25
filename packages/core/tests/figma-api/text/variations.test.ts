import { beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { FIXTURES } from '#core-tests/helpers/paths'

import { FigmaAPI } from '@open-pencil/core/figma-api'
import { fontManager } from '@open-pencil/core/text'
import { SceneGraph } from '@open-pencil/scene-graph'

// Behaviour measured in live Figma (2026-10-25) with its variable Inter and Roboto Flex. These
// tests draw from our bundled Inter, whose axes are `opsz` and `wght`, with nine named instances
// from Thin to Black.
const VARIABLE = 'Variations Test'
const STATIC = 'Variations Static'

beforeAll(async () => {
  const variable = await Bun.file(join(FIXTURES, 'fonts', 'InterVariable-Latin.ttf')).arrayBuffer()
  const static_ = await Bun.file(join(FIXTURES, 'fonts', 'InterRegular-Faces.ttf')).arrayBuffer()
  fontManager.markLoaded(VARIABLE, 'Regular', variable)
  fontManager.markLoaded(STATIC, 'Regular', static_)
})

function text(family = VARIABLE) {
  const api = new FigmaAPI(new SceneGraph())
  const node = api.createText()
  node.fontName = { family, style: 'Regular' }
  node.characters = 'Hamburg'
  return { api, node }
}

describe('variable fonts in the plugin API', () => {
  test('lists a family’s axis tags in code unit order, null for a static family', () => {
    const { api } = text()
    expect(api.getFontFamilyVariationAxes(VARIABLE)).toEqual(['opsz', 'wght'])
    expect(api.getFontFamilyVariationAxes(STATIC)).toBeNull()
    expect(() => api.getFontFamilyVariationAxes('Variations Unloaded')).toThrow(
      'in getFontFamilyVariationAxes: Font family "Variations Unloaded" is not available.'
    )
  })

  test('reads every axis of a variable font, and none of a static one', () => {
    expect(text().node.fontName).toEqual({
      family: VARIABLE,
      style: 'Regular',
      variationSettings: { opsz: 14, wght: 400 }
    })
    expect(text(STATIC).node.fontName).toEqual({ family: STATIC, style: 'Regular' })
  })

  test('picks the nearest named style for axes without a style, the heavier where two tie', () => {
    const { node } = text()
    for (const [wght, style] of [
      [900, 'Black'],
      [650, 'Bold'],
      [550, 'Semi Bold'],
      [450, 'Medium'],
      [1, 'Thin']
    ] as const) {
      node.setRangeFontName(0, node.characters.length, {
        family: VARIABLE,
        variationSettings: { wght }
      })
      expect(node.fontName).toMatchObject({ style, variationSettings: { wght } })
      expect(node.fontWeight).toBe(wght)
    }
  })

  test('keeps a named style under the axes set over it, and the current style with no axes', () => {
    const { node } = text()
    node.fontName = { family: VARIABLE, style: 'Regular', variationSettings: { wght: 550 } }
    expect(node.fontName).toEqual({
      family: VARIABLE,
      style: 'Regular',
      variationSettings: { opsz: 14, wght: 550 }
    })
    expect(node.fontWeight).toBe(550)
    node.fontName = { family: VARIABLE, style: 'Bold' }
    node.setRangeFontName(0, node.characters.length, { family: VARIABLE })
    expect(node.fontName).toMatchObject({ style: 'Bold', variationSettings: { wght: 700 } })
  })

  test('rejects axes the family does not have, as Figma does', () => {
    const { node } = text()
    expect(() => {
      node.fontName = { family: VARIABLE, style: 'Regular', variationSettings: { slnt: -10 } }
    }).toThrow(
      'in set_fontName: "slnt" is not a valid variation setting. Valid settings are ["opsz","wght"].'
    )
    expect(() => {
      node.fontName = { family: STATIC, style: 'Regular', variationSettings: { wght: 700 } }
    }).toThrow(
      `in set_fontName: "wght" is not a valid variation setting. Font "${STATIC}" has no variation axes.`
    )
  })

  test('reads an optical size that follows the font size as the style’s own', () => {
    const { node } = text()
    node.fontSize = 48
    expect(node.fontName).toMatchObject({ variationSettings: { opsz: 14 } })
  })

  test('sets a range’s font from axes alone', () => {
    const { node } = text()
    node.setRangeFontName(0, 3, { family: VARIABLE, variationSettings: { wght: 700 } })
    expect(node.getRangeFontName(0, 3)).toEqual({
      family: VARIABLE,
      style: 'Bold',
      variationSettings: { opsz: 14, wght: 700 }
    })
    expect(node.getRangeFontName(3, 7)).toMatchObject({ style: 'Regular' })
  })

  test('loads every style of a family named alone', async () => {
    const loaded: string[] = []
    // Only the host knows the family, so no web provider is asked for its faces.
    const providers = fontManager.enabledOnlineFontProviders()
    fontManager.setOnlineFontProviders({})
    fontManager.setHostFontCatalog([{ family: 'Variations Load', styles: ['Regular', 'Bold'] }])
    fontManager.setHostFontLoader(async (family, style) => {
      if (family === 'Variations Load') loaded.push(style)
      return null
    })
    try {
      await new FigmaAPI(new SceneGraph()).loadFontAsync({ family: 'Variations Load' })
    } finally {
      fontManager.setHostFontLoader(null)
      fontManager.setHostFontCatalog([])
      fontManager.setOnlineFontProviders(
        Object.fromEntries(providers.map((provider) => [provider, true]))
      )
    }
    expect(loaded.sort()).toEqual(['Bold', 'Regular'])
  })
})
