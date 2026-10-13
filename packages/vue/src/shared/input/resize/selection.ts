import { compact } from 'es-toolkit'
import { toRaw } from 'vue'

import type { Editor } from '@open-pencil/core/editor'
import {
  createSceneGeometry,
  transformZoneAt,
  type HandlePosition
} from '@open-pencil/core/geometry'
import { placeInResizedBounds, selectionPlacement } from '@open-pencil/scene-graph/coordinate'
import { computeBounds } from '@open-pencil/scene-graph/geometry'
import type { Rect } from '@open-pencil/scene-graph/primitives'

import {
  applyResizedRect,
  cancelResizePreview,
  commitResizePreview,
  scaledChanges
} from '#vue/shared/input/resize'
import { calculateResizeRect } from '#vue/shared/input/resize/rect'
import { createResizeDrag } from '#vue/shared/input/resize/start'
import type { DragResizeSelection, DragState } from '#vue/shared/input/types'

/**
 * A multi-selection's axis-aligned canvas bounds, the box the overlay draws its handles on, or
 * null when fewer than two layers are selected.
 */
export function selectionBounds(editor: Editor): Rect | null {
  if (editor.state.selectedIds.size < 2) return null
  const geometry = createSceneGeometry(editor.graph, editor.state.rotationPreview)
  const nodes = compact([...editor.state.selectedIds].map((id) => editor.graph.getNode(id)))
  return nodes.length < 2 ? null : computeBounds(nodes.map(geometry.bounds))
}

/** The multi-selection bounds' resize handle under a canvas point, if any. */
export function selectionResizeHandleAt(
  cx: number,
  cy: number,
  editor: Editor
): HandlePosition | null {
  const bounds = selectionBounds(editor)
  if (!bounds) return null
  const zone = transformZoneAt({ x: cx, y: cy }, bounds, editor.renderer?.zoom ?? 1)
  return zone?.kind === 'resize' ? zone.handle : null
}

/** Starts resizing a multi-selection from a handle of its bounds; unlocked layers take part. */
export function tryStartSelectionResize(
  cx: number,
  cy: number,
  editor: Editor
): DragResizeSelection | null {
  const origBounds = selectionBounds(editor)
  const handle = selectionResizeHandleAt(cx, cy, editor)
  if (!origBounds || !handle) return null
  const members = compact(
    [...editor.state.selectedIds].map((id) => {
      const node = editor.graph.getNode(id)
      if (!node || node.locked) return undefined
      return {
        drag: createResizeDrag(node, handle, cx, cy, editor),
        placement: selectionPlacement(node, editor.graph)
      }
    })
  )
  if (members.length === 0) return null
  return { type: 'resize-selection', handle, startX: cx, startY: cy, origBounds, members }
}

/** Scales the selection's bounds with the pointer; Shift keeps their proportions. */
export function applySelectionResize(
  dragState: DragResizeSelection,
  cx: number,
  cy: number,
  shiftKey: boolean,
  editor: Editor
) {
  // As in applyResize: reactive drag state must not leak into graph writes.
  const d = toRaw(dragState)
  const { origBounds } = d
  const aspect =
    shiftKey && origBounds.width > 0 && origBounds.height > 0
      ? origBounds.width / origBounds.height
      : null
  const bounds = calculateResizeRect(d.handle, origBounds, cx - d.startX, cy - d.startY, aspect)
  for (const { drag, placement } of d.members) {
    const rect = placeInResizedBounds(placement, origBounds, bounds)
    applyResizedRect(drag, rect, scaledChanges(drag, rect), editor)
  }
  editor.requestRepaint()
}

/** Commits every member's resize, then fits the groups around them once, as one undo step. */
export function commitSelectionResize(dragState: DragResizeSelection, editor: Editor) {
  const d = toRaw(dragState)
  editor.undo.runBatch('Resize', () => {
    for (const { drag } of d.members) commitResizePreview(drag, editor, { fitGroups: false })
    const parentIds = compact(
      d.members.map(({ drag }) => editor.graph.getNode(drag.nodeId)?.parentId)
    )
    editor.fitEnclosingGroups(new Set(parentIds))
  })
}

/** Puts every member back where the abandoned resize started. */
export function cancelSelectionResize(dragState: DragResizeSelection, editor: Editor) {
  for (const { drag } of toRaw(dragState).members) cancelResizePreview(drag, editor)
}

/** Puts back a single-layer or multi-selection resize the pointer abandoned; other drags pass. */
export function cancelResizeDrag(dragState: DragState | null, editor: Editor) {
  if (dragState?.type === 'resize') cancelResizePreview(dragState, editor)
  else if (dragState?.type === 'resize-selection') cancelSelectionResize(dragState, editor)
}
