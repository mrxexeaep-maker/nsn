import type { ArcData, VectorNetwork } from '@open-pencil/scene-graph'
import { parseSVGPath } from '@open-pencil/scene-graph/parse-path'

import type { PenNode } from './schema'
import { resolveNumber, type VarContext } from './variables'

const DEGREES = Math.PI / 180

/**
 * An ellipse's arc. pen.dev measures `startAngle` counter-clockwise from the right and sweeps
 * counter-clockwise for a positive `sweepAngle`; the scene graph measures clockwise.
 */
export function ellipseArc(pen: PenNode, ctx: VarContext): ArcData | null {
  if (pen.innerRadius === undefined && pen.startAngle === undefined && pen.sweepAngle === undefined)
    return null
  const start = resolveNumber(pen.startAngle, ctx)
  const sweep = Math.max(-360, Math.min(360, resolveNumber(pen.sweepAngle, ctx, 360)))
  return {
    startingAngle: -start * DEGREES,
    endingAngle: -(start + sweep) * DEGREES,
    innerRadius: Math.max(0, Math.min(1, resolveNumber(pen.innerRadius, ctx)))
  }
}

type ViewBox = [x: number, y: number, width: number, height: number]

function networkBounds(network: VectorNetwork): ViewBox {
  const xs = network.vertices.map((vertex) => vertex.x)
  const ys = network.vertices.map((vertex) => vertex.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y]
}

/**
 * A path's geometry in its box. `viewBox` is the region of the path's coordinates that fills the
 * box; without one, the geometry's own bounds do. An axis the geometry has no extent on is not
 * scaled, so a straight line keeps its place.
 */
export function pathNetwork(pen: PenNode, width: number, height: number): VectorNetwork | null {
  if (!pen.geometry) return null
  const network = parseSVGPath(pen.geometry, pen.fillRule === 'evenodd' ? 'EVENODD' : 'NONZERO')
  if (network.vertices.length === 0) return network
  const [vx, vy, vw, vh] = pen.viewBox ?? networkBounds(network)
  const sx = vw > 0 ? width / vw : 1
  const sy = vh > 0 ? height / vh : 1
  for (const vertex of network.vertices) {
    vertex.x = (vertex.x - vx) * sx
    vertex.y = (vertex.y - vy) * sy
  }
  for (const segment of network.segments) {
    segment.tangentStart = { x: segment.tangentStart.x * sx, y: segment.tangentStart.y * sy }
    segment.tangentEnd = { x: segment.tangentEnd.x * sx, y: segment.tangentEnd.y * sy }
  }
  return network
}
