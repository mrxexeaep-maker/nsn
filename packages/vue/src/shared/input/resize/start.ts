import type { Editor } from '@open-pencil/core/editor'
import type { HandlePosition } from '@open-pencil/core/geometry'
import { enforcedAspectRatio } from '@open-pencil/scene-graph'
import type { SceneNode } from '@open-pencil/scene-graph'
import { collectResizeDescendants, createResizeSnapshot } from '@open-pencil/scene-graph/resize'

import { getHitHandleByMatrix } from '#vue/shared/input/geometry'
import type { DragResize } from '#vue/shared/input/types'

/** A resize of `node` from `handle`, holding the drag-start state every step scales from. */
export function createResizeDrag(
  node: SceneNode,
  handle: HandlePosition,
  cx: number,
  cy: number,
  editor: Editor
): DragResize {
  const snap = createResizeSnapshot(node)
  return {
    type: 'resize',
    handle,
    startX: cx,
    startY: cy,
    origRect: { x: node.x, y: node.y, width: node.width, height: node.height },
    nodeId: node.id,
    origVectorNetwork: snap.vectorNetwork,
    origFillGeometry: snap.fillGeometry,
    origStrokeGeometry: snap.strokeGeometry,
    origDerivedTextGlyphs: snap.derivedTextGlyphs,
    origStrokes: snap.strokes,
    origTextPathData: snap.textPathData,
    origTextPathBox: snap.textPathBox,
    origChildren: collectResizeDescendants(editor.graph, node.id),
    lockedAspectRatio: enforcedAspectRatio(node),
    appliedRect: { x: node.x, y: node.y, width: node.width, height: node.height }
  }
}

export function tryStartResize(cx: number, cy: number, editor: Editor): DragResize | null {
  for (const id of editor.state.selectedIds) {
    const node = editor.graph.getNode(id)
    if (!node || node.locked) continue
    const handleResult = getHitHandleByMatrix(
      cx,
      cy,
      node,
      editor.graph,
      editor.renderer?.zoom,
      editor.state.rotationPreview
    )
    if (handleResult) return createResizeDrag(node, handleResult.handle, cx, cy, editor)
  }
  return null
}
