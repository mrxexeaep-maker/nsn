import { encodePathCommandsBlob } from '@open-pencil/fig/node-change'
import type { SceneNode, TextPathData } from '@open-pencil/scene-graph'

import { weightToStyle } from '#core/text/fonts'
import { getGlyphOutlineMetricsSync } from '#core/text/opentype'
import {
  calibratePathTextLayout,
  getTextPathData,
  layoutPathTextFromAdvances,
  sampleTextPath
} from '#core/text/path'

/**
 * Re-flow imported path text when its characters change: rebuild glyph
 * outlines from the local font and pen-walk them along the preserved path,
 * keeping the calibrated anchor and mean normal offset. Returns {} whenever
 * the node is not reflowable path text or the font is unavailable — the
 * scene graph then falls back to clearing the baked glyphs (today's
 * plain-text editing behavior).
 */
export function pathTextEditChanges(
  node: SceneNode | undefined,
  changes: Partial<SceneNode>
): Partial<Pick<SceneNode, 'derivedTextGlyphs' | 'strokeGeometry'>> {
  if (node?.type !== 'TEXT') return {}
  if (typeof changes.text !== 'string') return {}
  if (changes.text.trim().length === 0) {
    return node.textPathBox ? { derivedTextGlyphs: null, strokeGeometry: [] } : {}
  }
  if (!node.textPathBox || !node.derivedTextGlyphs?.length) return {}
  const data = getTextPathData(node)
  if (!data) return {}

  // Prefer pending typography from the same update batch over the pre-update
  // node so { text, fontSize/fontFamily/... } stays consistent for reflow.
  const fontFamily = changes.fontFamily ?? node.fontFamily
  const fontWeight = changes.fontWeight ?? node.fontWeight
  const italic = changes.italic ?? node.italic
  const fontSize = changes.fontSize ?? node.fontSize
  const letterSpacing = changes.letterSpacing ?? node.letterSpacing

  const metrics = getGlyphOutlineMetricsSync(
    fontFamily,
    weightToStyle(fontWeight, italic),
    changes.text,
    fontSize
  )
  if (!metrics) return {}

  const layout = calibratePathTextLayout(node.derivedTextGlyphs, data, node.textPathBox)
  if (!layout) return {}
  const offset = layout.offsets.reduce((sum, o) => sum + o, 0) / layout.offsets.length
  const anchor = alignedAnchor(node, data, layout.anchor, metrics, letterSpacing)

  const glyphs = layoutPathTextFromAdvances(
    data,
    node.textPathBox,
    anchor,
    offset,
    metrics.map((m) => ({
      commandsBlob: encodePathCommandsBlob(m.commands, fontSize),
      fontSize,
      // Pen walk expects em advances (it multiplies by fontSize); metrics and
      // letterSpacing are px. Folding letterSpacing in here (rather than
      // threading it through layoutPathTextFromAdvances) keeps that function's
      // em-advance contract unchanged for its one caller.
      advance: (m.advance + letterSpacing) / fontSize
    }))
  )
  // Baked silhouettes belong to the OLD string — clear them so the renderer
  // rebuilds per-glyph silhouettes for the new lettering.
  return glyphs ? { derivedTextGlyphs: glyphs, strokeGeometry: [] } : {}
}

/** How far along the path the start of new text moves so it keeps its alignment, px. */
function alignmentShift(align: SceneNode['textAlignHorizontal'], before: number, after: number) {
  if (align === 'CENTER') return (before - after) / 2
  if (align === 'RIGHT') return before - after
  return 0
}

/**
 * Where new text starts on the path, as a fraction of its length. Figma places path text by its
 * alignment, so centered text keeps its middle where it was and right-aligned text its end; text
 * aligned left keeps its start. The old and new runs are measured the same way, so the shift is
 * the difference in their widths.
 */
function alignedAnchor(
  node: SceneNode,
  data: TextPathData,
  anchor: number,
  metrics: Array<{ advance: number }>,
  letterSpacing: number
): number {
  if (node.textAlignHorizontal !== 'CENTER' && node.textAlignHorizontal !== 'RIGHT') return anchor
  const box = node.textPathBox
  const path = box ? sampleTextPath(data, box) : null
  const old = getGlyphOutlineMetricsSync(
    node.fontFamily,
    weightToStyle(node.fontWeight, node.italic),
    node.text,
    node.fontSize
  )
  if (!path || path.length === 0 || !old) return anchor
  const width = (run: Array<{ advance: number }>, spacing: number) =>
    run.reduce((sum, glyph) => sum + glyph.advance + spacing, 0)
  const shift = alignmentShift(
    node.textAlignHorizontal,
    width(old, node.letterSpacing),
    width(metrics, letterSpacing)
  )
  return anchor + ((data.forward ? 1 : -1) * shift) / path.length
}
