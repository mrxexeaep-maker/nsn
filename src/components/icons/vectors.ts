import { toRaw, type FunctionalComponent } from 'vue'

import { vectorNetworkToSVGPaths } from '@open-pencil/core/io'
import { transformVectorNetwork, type VectorNetwork } from '@open-pencil/scene-graph'
import { getNodeLocalMatrix } from '@open-pencil/scene-graph/coordinate'
import Matrix from '@open-pencil/scene-graph/matrix'
import type { LayerVectorIcon } from '@open-pencil/vue'

import { maskIcon } from './mask'

/** The layer row's icon slot (`size-3` in the layer tree theme), so the outline draws at 1:1. */
const SLOT = 12
/** Figma draws a vector's row icon 9 px across, inside a 10 px square, stroked 1 px. */
const SHAPE = 9
const STROKE = 1
/** Figma shows its generic vector glyph once vertices and segments together reach this many. */
const MAX_ELEMENTS = 129

/**
 * A vector's outline as icon markup, as Figma draws its layer row (`generateObjectsPanelIcon`):
 * turned and reflected as the layer is, with the layer's box fitted to the icon and centred, and
 * never filled. Null for a network with nothing to draw or too much to draw.
 */
export function vectorIconSVG(vector: LayerVectorIcon): string | null {
  const { network, width, height } = vector
  const { vertices, segments } = network
  if (segments.length === 0 || vertices.length + segments.length >= MAX_ELEMENTS) return null
  if (segments.some((segment) => !vertices[segment.start] || !vertices[segment.end])) return null

  // Figma fits the layer's turned box, not the outline, so a turned shape keeps its size.
  const placement = getNodeLocalMatrix({ ...vector, type: 'VECTOR', x: 0, y: 0 })
  const corners = Matrix.mapPoints(placement, [0, 0, width, 0, width, height, 0, height])
  const xs = corners.filter((_, index) => index % 2 === 0)
  const ys = corners.filter((_, index) => index % 2 === 1)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const boxWidth = Math.max(...xs) - minX
  const boxHeight = Math.max(...ys) - minY
  const extent = Math.max(boxWidth, boxHeight)
  if (!(extent > 0)) return null

  const scale = SHAPE / extent
  const fit = Matrix.multiply(
    Matrix.translated(
      (SLOT - boxWidth * scale) / 2 - minX * scale,
      (SLOT - boxHeight * scale) / 2 - minY * scale
    ),
    Matrix.scaled(scale, scale),
    placement
  )
  const d = vectorNetworkToSVGPaths(transformVectorNetwork(fit, network)).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SLOT} ${SLOT}"><path d="${d}" fill="none" stroke="black" stroke-width="${STROKE}"/></svg>`
}

const icons = new WeakMap<VectorNetwork, Map<string, FunctionalComponent | null>>()

/** A vector's own outline as an icon component, built once per network and placement. */
export function vectorIcon(vector: LayerVectorIcon): FunctionalComponent | null {
  const network = toRaw(vector.network)
  let placements = icons.get(network)
  if (!placements) {
    placements = new Map()
    icons.set(network, placements)
  }
  const { width, height, rotation, flipX, flipY } = vector
  const key = `${width} ${height} ${rotation} ${flipX} ${flipY}`
  let icon = placements.get(key)
  if (icon === undefined) {
    const svg = vectorIconSVG({ ...vector, network })
    icon = svg ? maskIcon(svg) : null
    placements.set(key, icon)
  }
  return icon
}
