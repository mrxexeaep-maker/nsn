import { expect, test } from 'bun:test'

import { expectDefined } from '#core-tests/helpers/assert'

import { SkiaRenderer } from '#core/canvas'
import { initCanvasKit } from '#core/io/formats/raster/headless'
import { fontManager } from '#core/text'

const ck = await initCanvasKit()

test('destroying a renderer that never loaded fonts leaves other renderers their fonts', () => {
  const provider = ck.TypefaceFontProvider.Make()
  fontManager.attachProvider(ck, provider)
  try {
    const surface = expectDefined(ck.MakeSurface(1, 1), 'surface')
    new SkiaRenderer(ck, surface).destroy()

    expect(fontManager.providerFor(ck)).toBe(provider)
  } finally {
    fontManager.detachProvider(provider)
    provider.delete()
  }
})
