import type { SceneGraph } from '@open-pencil/scene-graph'

import {
  canDrawPlatformEmoji,
  mayHoldEmoji,
  NOTO_COLOR_EMOJI_FAMILY,
  savedEmojiCharacters
} from '#core/text/emoji'
import { fontManager } from '#core/text/fonts'
import { collectGraphFontRequirements, collectNodeFontFaces } from '#core/text/requirements'
import { missingGraphFontScripts } from '#core/text/resolved-requirements'

import { documentFontStatus, type DocumentFontStatus } from './font/status'

export async function prepareGraphFonts(
  graph: SceneGraph,
  nodeIds: readonly string[]
): Promise<DocumentFontStatus> {
  const requirements = collectGraphFontRequirements(graph, nodeIds)
  const faces = requirements.nodes.flatMap(collectNodeFontFaces)
  await Promise.all(
    faces.map(({ family, style }) => fontManager.loadFont(family, style, requirements.characters))
  )
  await fontManager.ensureFallbackPack(
    missingGraphFontScripts(requirements),
    requirements.characters
  )
  // Without a platform that draws emoji, emoji are drawn with Noto, loaded for just these: the
  // saved ones, and the characters of the text that may be drawn as emoji.
  const emoji =
    requirements.nodes.map(savedEmojiCharacters).join('') +
    Array.from(requirements.characters).filter(mayHoldEmoji).join('')
  if (emoji && !canDrawPlatformEmoji())
    await fontManager.loadRemoteFont(NOTO_COLOR_EMOJI_FAMILY, 'Regular', emoji)
  return documentFontStatus(graph, nodeIds)
}
