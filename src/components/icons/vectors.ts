import { toRaw, type FunctionalComponent } from 'vue'

import { vectorNetworkToSVGPaths } from '@open-pencil/core/io'
import { computeAccurateBounds } from '@open-pencil/core/vector'
import { transformVectorNetwork, type VectorNetwork } from '@open-pencil/scene-graph'

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
 * fitted to the square with its proportions kept, centred, and never filled. Null for a network
 * with nothing to draw or too much to draw.
 */
export function vectorIconSVG(network: VectorNetwork): string | null {
  const { vertices, segments } = network
  if (segments.length === 0 || vertices.length + segments.length >= MAX_ELEMENTS) return null
  if (segments.some((segment) => !vertices[segment.start] || !vertices[segment.end])) return null

  const bounds = computeAccurateBounds(network)
  const extent = Math.max(bounds.width, bounds.height)
  if (!(extent > 0)) return null
  const scale = SHAPE / extent
  const x = (SLOT - bounds.width * scale) / 2 - bounds.x * scale
  const y = (SLOT - bounds.height * scale) / 2 - bounds.y * scale
  const fitted = transformVectorNetwork([scale, 0, x, 0, scale, y, 0, 0, 1], network)
  const d = vectorNetworkToSVGPaths(fitted).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SLOT} ${SLOT}"><path d="${d}" fill="none" stroke="black" stroke-width="${STROKE}"/></svg>`
}

const icons = new WeakMap<VectorNetwork, FunctionalComponent | null>()

/** A vector's own outline as an icon component, built once per network. */
export function vectorIcon(network: VectorNetwork): FunctionalComponent | null {
  const raw = toRaw(network)
  let icon = icons.get(raw)
  if (icon === undefined) {
    const svg = vectorIconSVG(raw)
    icon = svg ? maskIcon(svg) : null
    icons.set(raw, icon)
  }
  return icon
}
