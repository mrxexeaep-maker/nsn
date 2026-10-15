import { toRaw } from 'vue'

import type { Editor } from '@open-pencil/core/editor'
import { scaleNodeChanges } from '@open-pencil/scene-graph'
import type { SceneNode } from '@open-pencil/scene-graph'

import { getHitHandleByMatrix } from '#vue/shared/input/geometry'
import { calculateResizeRect } from '#vue/shared/input/resize/rect'
import type { DragStickyScale } from '#vue/shared/input/types'

/** The smallest scale a corner drag takes a note to, so it never folds away. */
const MIN_STICKY_SCALE = 0.1

function subtree(editor: Editor, root: SceneNode): Map<string, SceneNode> {
  const nodes = new Map<string, SceneNode>()
  const visit = (node: SceneNode) => {
    nodes.set(node.id, { ...node })
    for (const child of editor.graph.getChildren(node.id)) visit(child)
  }
  visit(root)
  return nodes
}

/**
 * Dragging a selected sticky note's corner scales the whole note, its text included, as FigJam
 * does: a note has no free size, since its height follows its text.
 */
export function tryStartStickyScale(
  cx: number,
  cy: number,
  editor: Editor
): DragStickyScale | null {
  if (editor.state.selectedIds.size !== 1) return null
  const node = editor.graph.getNode([...editor.state.selectedIds][0])
  if (node?.type !== 'STICKY' || node.locked) return null
  const hit = getHitHandleByMatrix(
    cx,
    cy,
    node,
    editor.graph,
    editor.renderer?.zoom,
    editor.state.rotationPreview
  )
  if (hit?.handle.length !== 2) return null
  const drag: DragStickyScale = {
    type: 'sticky-scale',
    handle: hit.handle,
    startX: cx,
    startY: cy,
    nodeId: node.id,
    origRect: { x: node.x, y: node.y, width: node.width, height: node.height },
    originals: subtree(editor, node),
    scale: 1,
    position: { x: node.x, y: node.y },
    commit: () => commitStickyScale(drag, editor),
    cancel: () => cancelStickyScale(drag, editor)
  }
  return drag
}

/** Shows the note at the scale the corner has reached; only the commit records it. */
export function applyStickyScale(drag: DragStickyScale, cx: number, cy: number, editor: Editor) {
  const d = toRaw(drag)
  const { origRect } = d
  const rect = calculateResizeRect(
    d.handle,
    origRect,
    cx - d.startX,
    cy - d.startY,
    origRect.width / origRect.height
  )
  d.scale = Math.max(MIN_STICKY_SCALE, rect.width / origRect.width)
  d.position = {
    x: d.handle.includes('w') ? origRect.x + origRect.width * (1 - d.scale) : origRect.x,
    y: d.handle.startsWith('n') ? origRect.y + origRect.height * (1 - d.scale) : origRect.y
  }
  for (const [id, original] of d.originals) {
    const changes = scaleNodeChanges(original, d.scale, id !== d.nodeId)
    if (id === d.nodeId) Object.assign(changes, d.position)
    editor.graph.updateNodePreview(id, changes)
  }
  editor.requestRepaint()
}

function restoreStickyScale(d: DragStickyScale, editor: Editor) {
  for (const [id, original] of d.originals) {
    const changes = scaleNodeChanges(original, 1, id !== d.nodeId)
    if (id === d.nodeId) Object.assign(changes, { x: original.x, y: original.y })
    editor.graph.updateNodePreview(id, changes)
  }
}

function commitStickyScale(drag: DragStickyScale, editor: Editor) {
  const d = toRaw(drag)
  restoreStickyScale(d, editor)
  if (d.scale !== 1) editor.scaleStickyNote(d.nodeId, d.scale, d.position)
  editor.requestRender()
}

function cancelStickyScale(drag: DragStickyScale, editor: Editor) {
  restoreStickyScale(toRaw(drag), editor)
  editor.requestRender()
}
