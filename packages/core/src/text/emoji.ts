import type { DerivedTextGlyph, SceneNode } from '@open-pencil/scene-graph'

/** The colour emoji font that draws emoji where the platform cannot. */
export const NOTO_COLOR_EMOJI_FAMILY = 'Noto Color Emoji'

/** The characters a saved emoji glyph stands for. */
export function emojiText(glyph: Pick<DerivedTextGlyph, 'emojiCodePoints'>): string {
  return glyph.emojiCodePoints ? String.fromCodePoint(...glyph.emojiCodePoints) : ''
}

/** Whether the platform draws emoji itself: a browser does, through its 2D canvas. */
export function canDrawPlatformEmoji(): boolean {
  return typeof OffscreenCanvas !== 'undefined'
}

/** The emoji a text's saved glyphs draw, as characters, for loading a font that has them. */
export function savedEmojiCharacters(node: SceneNode): string {
  let characters = ''
  for (const glyph of node.derivedTextGlyphs ?? []) characters += emojiText(glyph)
  return characters
}
