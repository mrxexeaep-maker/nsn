import type { Rect } from '@open-pencil/scene-graph/primitives'

export interface RotationPreview {
  nodeId: string
  angle: number
}

/**
 * A multi-selection being turned: the axis-aligned canvas bounds it had when the rotation started
 * and the angle, in degrees, it has turned about their center, so the overlay draws the selection's
 * box turning with its layers instead of growing around them.
 */
export interface SelectionRotationPreview {
  bounds: Rect
  angle: number
}

export interface ViewportTransform {
  panX: number
  panY: number
  zoom: number
}
