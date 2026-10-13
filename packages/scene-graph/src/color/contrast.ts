import { wcagContrast } from 'culori'

import { BLACK, WHITE } from '../constants'
import type { Color } from '../primitives'

/** Opaque color seen when `foreground` at `alpha` is drawn over an opaque `background`. */
export function compositeOver(foreground: Color, background: Color, alpha = foreground.a): Color {
  const mix = (top: number, bottom: number) => top * alpha + bottom * (1 - alpha)
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
    a: 1
  }
}

/** WCAG 2 contrast ratio of two colors, from 1 to 21; alpha is ignored, so composite first. */
export function contrastRatio(
  a: Pick<Color, 'r' | 'g' | 'b'>,
  b: Pick<Color, 'r' | 'g' | 'b'>
): number {
  return wcagContrast(
    { mode: 'rgb', r: a.r, g: a.g, b: a.b },
    { mode: 'rgb', r: b.r, g: b.g, b: b.b }
  )
}

/** Screen luminance as APCA 0.0.98G measures it, with its soft clamp near black. */
function apcaLuminance({ r, g, b }: Pick<Color, 'r' | 'g' | 'b'>): number {
  const y = 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4
  return y < 0.022 ? y + (0.022 - y) ** 1.414 : y
}

/**
 * APCA lightness contrast (Lc) of `text` on an opaque `background`, about -108 to 106; negative
 * when the text is lighter. Unlike WCAG 2 it rates light text on mid-tone saturated colors as
 * readable as it looks, where WCAG 2 prefers black.
 */
export function apcaContrast(
  text: Pick<Color, 'r' | 'g' | 'b'>,
  background: Pick<Color, 'r' | 'g' | 'b'>
): number {
  const textY = apcaLuminance(text)
  const backgroundY = apcaLuminance(background)
  if (backgroundY > textY) {
    const sapc = (backgroundY ** 0.56 - textY ** 0.57) * 1.14
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100
  }
  const sapc = (backgroundY ** 0.65 - textY ** 0.62) * 1.14
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100
}

/**
 * Black or white, whichever reads better on an opaque `background`. `wcag2` keeps the WCAG 2
 * ratio, which canvas labels follow; `apca` suits UI text on a person's or agent's color, where
 * WCAG 2 puts black on mid-tone blues and reds that read better with white.
 */
export function readableForeground(
  background: Pick<Color, 'r' | 'g' | 'b'>,
  measure: 'wcag2' | 'apca' = 'wcag2'
): Color {
  if (measure === 'apca') {
    return Math.abs(apcaContrast(BLACK, background)) >= Math.abs(apcaContrast(WHITE, background))
      ? BLACK
      : WHITE
  }
  return contrastRatio(background, BLACK) >= contrastRatio(background, WHITE) ? BLACK : WHITE
}
