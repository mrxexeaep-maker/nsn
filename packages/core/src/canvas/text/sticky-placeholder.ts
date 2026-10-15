import { generatedFrameOwner, stickySublayers } from '@open-pencil/scene-graph'
import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'
import { BLACK } from '@open-pencil/scene-graph/constants'

/** What an empty sticky note shows in its body, as FigJam and Figma draw it. */
export const STICKY_PLACEHOLDER = 'Type anything, @mention anyone'

/**
 * The body of an empty sticky note as the canvas draws it: the placeholder in the body's style,
 * black at 30%, as measured in FigJam. The note's text stays empty.
 */
export function stickyPlaceholderNode(graph: SceneGraph, node: SceneNode): SceneNode | null {
  if (node.type !== 'TEXT' || node.text !== '') return null
  const sticky = generatedFrameOwner(graph, node)
  if (sticky?.type !== 'STICKY' || stickySublayers(graph, sticky)?.body.id !== node.id) return null
  return {
    ...node,
    text: STICKY_PLACEHOLDER,
    styleRuns: [],
    textParagraphs: [],
    derivedTextGlyphs: null,
    fills: [{ type: 'SOLID', color: { ...BLACK }, opacity: 0.3, visible: true }]
  }
}
