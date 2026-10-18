import type { Canvas, Image } from 'canvaskit-wasm'

import type { SceneNode } from '@open-pencil/scene-graph'

import { ResourceCache } from '#core/cache/resource'
import type { SkiaRenderer } from '#core/canvas/renderer'
import {
  applyGlyphTransform,
  hasRotatedDerivedGlyphs,
  snapDerivedGlyphBaseline
} from '#core/canvas/text/derived'
import { canDrawPlatformEmoji, emojiText } from '#core/text/emoji'

import { rasterizeNotoEmoji, rasterizePlatformEmoji } from './raster'

/** Distinct emoji a renderer keeps drawn: one image each, at most a few hundred on a page. */
const MAX_EMOJI_IMAGES = 512

/**
 * Emoji images by what draws them and the emoji they show. An emoji the source cannot draw is
 * kept as `null`, so it is not drawn again each frame.
 */
export function createEmojiImageCache(): ResourceCache<string, Image | null> {
  return new ResourceCache({ maxEntries: MAX_EMOJI_IMAGES, dispose: (image) => image?.delete() })
}

function rasterizeEmoji(r: SkiaRenderer, platform: boolean, text: string): Image | null {
  if (platform) return rasterizePlatformEmoji(r.ck, text)
  return r.fontProvider ? rasterizeNotoEmoji(r.ck, r.fontProvider, text) : null
}

function emojiImage(r: SkiaRenderer, text: string): Image | null {
  const platform = canDrawPlatformEmoji()
  // Noto draws only once its font is loaded, so a later font generation tries again.
  const key = platform ? `platform:${text}` : `noto:${r.fontGeneration}:${text}`
  const cached = r.emojiImageCache.get(key)
  if (cached !== undefined) return cached
  const image = rasterizeEmoji(r, platform, text)
  r.emojiImageCache.set(key, image)
  return image
}

/**
 * Draws the emoji among a text's saved glyphs. Figma saves an emoji as a placeholder square
 * 1 em wide, from 0.07 em below the baseline, and draws the emoji's image over that square in
 * its own colours: the text's fills never reach it, while the layer's opacity does.
 */
export function drawSavedEmoji(r: SkiaRenderer, canvas: Canvas, node: SceneNode): void {
  const glyphs = node.derivedTextGlyphs
  if (!glyphs?.some((glyph) => glyph.emojiCodePoints)) return
  // Baselines snap as the saved glyphs around the emoji do.
  const snapBaselines = !hasRotatedDerivedGlyphs(node)
  const paint = new r.ck.Paint()
  paint.setAntiAlias(true)
  try {
    for (const glyph of glyphs) {
      if (!glyph.emojiCodePoints || glyph.fontSize <= 0) continue
      const image = emojiImage(r, emojiText(glyph))
      if (!image) continue
      canvas.save()
      applyGlyphTransform(
        canvas,
        glyph,
        snapBaselines ? snapDerivedGlyphBaseline(glyph.y) : glyph.y
      )
      const size = glyph.fontSize
      canvas.drawImageRectOptions(
        image,
        r.ck.LTRBRect(0, 0, image.width(), image.height()),
        r.ck.LTRBRect(0, -0.93 * size, size, 0.07 * size),
        r.ck.FilterMode.Linear,
        r.ck.MipmapMode.Linear,
        paint
      )
      canvas.restore()
    }
  } finally {
    paint.delete()
  }
}
