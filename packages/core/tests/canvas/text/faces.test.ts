import { describe, expect, test } from 'bun:test'

import type { CanvasKit, TypefaceFontProvider } from 'canvaskit-wasm'

import { expectDefined } from '#core-tests/helpers/assert'

import { createDefaultNode } from '@open-pencil/scene-graph/node-defaults'

import { buildParagraph } from '#core/canvas/text'
import { getCanvasKit } from '#core/canvaskit'
import { FontManager, fontManager } from '#core/text/fonts'

/** A family only these tests load, so faces other tests load cannot answer for it. */
const FAMILY = 'Faces Test Sans'

async function bundled(file: string): Promise<ArrayBuffer> {
  return expectDefined(await new FontManager().fetchBundledFont(file), file)
}

/** The pixels of text in a style, drawn by the paragraph the canvas draws. */
function drawn(
  ck: CanvasKit,
  fontProvider: TypefaceFontProvider,
  style: { fontWeight: number; italic: boolean }
): Uint8Array {
  const node = createDefaultNode(() => 'face-text', 'TEXT', {
    text: 'Faces',
    fontFamily: FAMILY,
    fontSize: 40,
    width: 300,
    height: 60,
    ...style
  })
  const paragraph = buildParagraph({ ck, fontProvider, fontsLoaded: true }, node, ck.BLACK, {
    halfLeading: true
  })
  const surface = expectDefined(ck.MakeSurface(300, 60), 'surface')
  try {
    surface.getCanvas().clear(ck.WHITE)
    paragraph.layout(300)
    paragraph.draw(surface.getCanvas(), 0, 0)
    return expectDefined(
      surface.getCanvas().readPixels(0, 0, { width: 300, height: 60, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }),
      'pixels'
    ) as Uint8Array
  } finally {
    surface.delete()
  }
}

/**
 * Asked for a face a family has not loaded, CanvasKit would slant or embolden another, which
 * neither Figma, a browser, nor a native text stack draws the same. Figma draws a missing face as
 * the face that exists and reports it missing; so does the canvas.
 */
describe('text faces', () => {
  test('draws a missing face as the loaded one rather than faking it', async () => {
    const ck = await getCanvasKit()
    const fontProvider = ck.TypefaceFontProvider.Make()
    fontManager.attachProvider(ck, fontProvider)
    fontManager.markLoaded(FAMILY, 'Regular', await bundled('/Inter-Regular.ttf'))
    const regular = drawn(ck, fontProvider, { fontWeight: 400, italic: false })
    expect(drawn(ck, fontProvider, { fontWeight: 400, italic: true })).toEqual(regular)
    expect(drawn(ck, fontProvider, { fontWeight: 700, italic: false })).toEqual(regular)
  })

  test('draws a face the family has loaded', async () => {
    const ck = await getCanvasKit()
    const fontProvider = ck.TypefaceFontProvider.Make()
    fontManager.attachProvider(ck, fontProvider)
    fontManager.markLoaded(FAMILY, 'Regular', await bundled('/Inter-Regular.ttf'))
    fontManager.markLoaded(FAMILY, 'Bold', await bundled('/Inter-Bold.ttf'))
    const regular = drawn(ck, fontProvider, { fontWeight: 400, italic: false })
    expect(drawn(ck, fontProvider, { fontWeight: 700, italic: false })).not.toEqual(regular)
  })
})
