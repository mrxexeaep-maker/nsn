import type { Canvas } from 'canvaskit-wasm'

import type { SceneNode, Stroke, VectorNetwork } from '@open-pencil/scene-graph'
import {
  collectArrowEndpoints,
  hasTrimmedShaft,
  lineStrokeEnds,
  trimArrowShafts
} from '@open-pencil/scene-graph/arrow-caps'
import type { Color } from '@open-pencil/scene-graph/primitives'

import type { SkiaRenderer } from '#core/canvas/renderer'
import { configureStrokePaint, drawArrowHeads, normalizeDashPattern } from '#core/canvas/strokes'

import { sideDashSpans } from './sides'

/** The path Figma strokes for a LINE, as a one-segment network its arrow heads can follow. */
function lineStrokeNetwork(node: SceneNode, stroke: Stroke): VectorNetwork {
  const cap = stroke.cap ?? node.strokeCap
  const { start, end } = lineStrokeEnds(node.width, node.height, stroke.weight, cap)
  const still = { x: 0, y: 0 }
  return {
    vertices: [start, end],
    segments: [{ start: 0, end: 1, tangentStart: still, tangentEnd: still }],
    regions: []
  }
}

/**
 * Strokes a LINE as Figma does: to one side of the line whatever the alignment, with its caps and
 * heads inside its length, and its dashes stretched to whole periods like a rectangle's side.
 */
export function drawLineStroke(
  r: SkiaRenderer,
  canvas: Canvas,
  node: SceneNode,
  stroke: Stroke,
  color: Color
): void {
  const cap = stroke.cap ?? node.strokeCap
  const network = lineStrokeNetwork(node, stroke)
  const shaft = hasTrimmedShaft(network, cap)
    ? trimArrowShafts(network, cap, stroke.weight)
    : network
  const [from, to] = shaft.vertices
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  const pattern = normalizeDashPattern(stroke.dashPattern)
  const spans = pattern.length > 0 ? sideDashSpans(length, pattern) : [[0, length]]

  configureStrokePaint(r, node, stroke, color)
  r.strokePaint.setPathEffect(null)
  const at = (distance: number) => (length > 0 ? distance / length : 0)
  for (const [start, end] of spans) {
    canvas.drawLine(
      from.x + (to.x - from.x) * at(start),
      from.y + (to.y - from.y) * at(start),
      from.x + (to.x - from.x) * at(end),
      from.y + (to.y - from.y) * at(end),
      r.strokePaint
    )
  }
  const heads = collectArrowEndpoints(network, cap)
  drawArrowHeads(r, canvas, heads, stroke.weight, color, stroke.opacity)
}
