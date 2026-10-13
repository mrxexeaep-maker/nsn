import type { SelectionFrame } from '@open-pencil/scene-graph/coordinate'

export interface RotationPreview {
  nodeId: string
  angle: number
}

/**
 * A multi-selection's frame while it turns: the box it started from, turned with its layers, so
 * the overlay draws the box turning instead of growing around them.
 */
export type SelectionRotationPreview = SelectionFrame

export interface ViewportTransform {
  panX: number
  panY: number
  zoom: number
}
