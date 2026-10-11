import { isNotNil } from 'es-toolkit/predicate'

import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'
import {
  getAxisAlignedBoundsInParent,
  getAxisAlignedWorldBounds,
  getNodeLocalMatrix,
  getParentWorldMatrix,
  getWorldMatrix,
  localTransformFromWorld
} from '@open-pencil/scene-graph/coordinate'
import { computeBounds } from '@open-pencil/scene-graph/geometry'
import Matrix, { type Mat3 } from '@open-pencil/scene-graph/matrix'
import type { Rect, Vector } from '@open-pencil/scene-graph/primitives'

import { DUPLICATE_FRAME_GAP } from '#core/constants'
import type { EditorContext } from '#core/editor/types'

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** Where copied layers sat on the canvas, which paste keeps as Figma does. */
export interface ClipboardPlacement {
  /** Each copied layer's canvas transform, in the order of the copied layers. */
  transforms: Mat3[]
  /** The canvas box of the frame the first layer was copied out of; null for a top-level layer. */
  sourceBox: Rect | null
}

/**
 * The placement of copied layers whose parents, if this document has them, are where they were
 * copied from. A layer whose parent it lacks counts as top-level.
 */
export function clipboardPlacement(
  graph: SceneGraph,
  roots: readonly SceneNode[]
): ClipboardPlacement {
  const parentOf = (node: SceneNode) => (node.parentId ? graph.getNode(node.parentId) : undefined)
  const transforms = roots.map((node) =>
    Matrix.multiply(getParentWorldMatrix(parentOf(node), graph), getNodeLocalMatrix(node))
  )
  const source = roots[0] && parentOf(roots[0])
  const sourceBox =
    source && source.type !== 'CANVAS' && source.id !== graph.rootId
      ? getAxisAlignedWorldBounds(source, graph)
      : null
  return { transforms, sourceBox }
}

/** The canvas box around layers, through every rotation and flip above them. */
function canvasBounds(graph: SceneGraph, nodes: readonly SceneNode[]): Rect {
  return getAxisAlignedBoundsInParent(nodes, graph.rootId, graph)
}

/** Moves layers by a distance on the canvas, whatever their parents' rotation and flips. */
export function translateOnCanvas(
  graph: SceneGraph,
  nodeIds: readonly string[],
  dx: number,
  dy: number
) {
  if (dx === 0 && dy === 0) return
  for (const id of nodeIds) {
    const node = graph.getNode(id)
    if (!node) continue
    const parent = node.parentId ? graph.getNode(node.parentId) : undefined
    const toParent = Matrix.invert(getParentWorldMatrix(parent, graph))
    if (!toParent) continue
    const origin = Matrix.mapPoint(toParent, { x: 0, y: 0 })
    const moved = Matrix.mapPoint(toParent, { x: dx, y: dy })
    graph.updateNode(id, { x: node.x + moved.x - origin.x, y: node.y + moved.y - origin.y })
  }
}

/**
 * How far to move a pasted box along one axis of its frame's canvas box, as Figma centres it.
 * Layers copied out of a frame keep their offset unless it starts at or past the frame's far
 * edge; top-level layers keep their place while it overlaps the frame. Either way an axis that
 * moves is centred, and a box overlapping an edge stays, however large.
 */
function centringShift(
  start: number,
  size: number,
  frameStart: number,
  frameSize: number,
  fromFrame: boolean
) {
  const offset = start - frameStart
  const outside = offset >= frameSize || (!fromFrame && offset + size <= 0)
  return outside ? frameStart + (frameSize - size) / 2 - start : 0
}

export function createClipboardPlacementActions(ctx: EditorContext) {
  /**
   * Where Figma puts a lone duplicate: on top of the original, except that a top-level frame, on
   * the page or in a section, goes to the first free place on its right.
   */
  function duplicatePosition(node: SceneNode, placed: readonly Rect[]): Vector {
    const parentId = node.parentId ?? ctx.state.currentPageId
    const parent = ctx.graph.getNode(parentId)
    const topLevel = !parent || parent.type === 'CANVAS' || parent.type === 'SECTION'
    if (node.type !== 'FRAME' || !topLevel) return { x: node.x, y: node.y }

    const box = getAxisAlignedBoundsInParent([node], parentId, ctx.graph)
    const others = [
      ...ctx.graph
        .getChildren(parentId)
        .map((sibling) => getAxisAlignedBoundsInParent([sibling], parentId, ctx.graph)),
      ...placed
    ]
    const candidate = { ...box, x: box.x + box.width + DUPLICATE_FRAME_GAP }
    for (;;) {
      const blocker = others.find((other) => overlaps(candidate, other))
      if (!blocker) break
      candidate.x = blocker.x + blocker.width + DUPLICATE_FRAME_GAP
    }
    return { x: node.x + candidate.x - box.x, y: node.y }
  }

  function translate(nodeIds: string[], dx: number, dy: number) {
    for (const id of nodeIds) {
      const node = ctx.graph.getNode(id)
      if (node) ctx.graph.updateNode(id, { x: node.x + dx, y: node.y + dy })
    }
  }

  /** The visible part of the canvas, or null when the editor has no viewport. */
  function viewportRect(): Rect | null {
    const { width, height } = ctx.getViewportSize()
    if (width <= 0 || height <= 0) return null
    const { panX, panY, zoom } = ctx.state
    return { x: -panX / zoom, y: -panY / zoom, width: width / zoom, height: height / zoom }
  }

  /** Centers each axis of the layers that does not fit inside their frame. */
  function fitInside(nodeIds: string[], parentId: string) {
    const parent = ctx.graph.getNode(parentId)
    const items = nodeIds.map((id) => ctx.graph.getNode(id)).filter(isNotNil)
    if (!parent || parent.type === 'CANVAS' || items.length === 0) return
    const box = computeBounds(items)
    const fitsX = box.x >= 0 && box.x + box.width <= parent.width
    const fitsY = box.y >= 0 && box.y + box.height <= parent.height
    translate(
      nodeIds,
      fitsX ? 0 : (parent.width - box.width) / 2 - box.x,
      fitsY ? 0 : (parent.height - box.height) / 2 - box.y
    )
  }

  /**
   * Places layers pasted from another app, whose copied position means nothing here: at the
   * cursor for Paste here, otherwise in the middle of the view and inside the frame they go into.
   */
  function placeForeignPaste(nodeIds: string[], parentId: string, cursor?: Vector) {
    if (cursor) {
      centerNodesAtCanvasPoint(nodeIds, cursor)
      return
    }
    const view = viewportRect()
    if (view)
      centerNodesAtCanvasPoint(nodeIds, {
        x: view.x + view.width / 2,
        y: view.y + view.height / 2
      })
    fitInside(nodeIds, parentId)
  }

  function nodesOf(nodeIds: readonly string[]) {
    return nodeIds.map((id) => ctx.graph.getNode(id)).filter(isNotNil)
  }

  /** Centers layers over another layer, wherever that layer sits. */
  function centerOver(nodeIds: string[], overId: string) {
    const over = ctx.graph.getNode(overId)
    if (!over) return
    centerNodesAtCanvasPoint(
      nodeIds,
      Matrix.mapPoint(getWorldMatrix(over, ctx.graph), { x: over.width / 2, y: over.height / 2 })
    )
  }

  /** Turns and flips pasted layers back to how they were drawn when copied, as Figma keeps them. */
  function keepCanvasTransforms(nodeIds: readonly string[], transforms: readonly Mat3[]) {
    for (const [index, world] of transforms.entries()) {
      const id = nodeIds.at(index)
      const node = id ? ctx.graph.getNode(id) : undefined
      if (!id || !node) continue
      const parent = node.parentId ? ctx.graph.getNode(node.parentId) : undefined
      const local = localTransformFromWorld(node, world, getParentWorldMatrix(parent, ctx.graph))
      if (local) ctx.graph.updateNode(id, local)
    }
  }

  /**
   * Places pasted layers as Figma does, in canvas boxes so a rotated or flipped frame changes
   * nothing. Layers copied out of a frame keep their offset from its box in the box of the frame
   * they are pasted into; top-level layers keep their place on the canvas. An axis Figma counts as
   * outside the destination frame is centred in it, and layers that would land out of view are
   * centred in the view. A paste that could not go into the selected layer (`requestedId`), such
   * as an instance into its own main component, lands over that layer.
   */
  function placePasted(
    nodeIds: string[],
    placement: ClipboardPlacement,
    targetId: string,
    requestedId = targetId
  ) {
    if (requestedId !== targetId) {
      centerOver(nodeIds, requestedId)
      return
    }
    const items = nodesOf(nodeIds)
    if (items.length === 0) return
    const target = ctx.graph.getNode(targetId)
    const frame =
      target && target.type !== 'CANVAS' ? getAxisAlignedWorldBounds(target, ctx.graph) : null
    const { sourceBox } = placement
    if (frame) {
      if (sourceBox)
        translateOnCanvas(ctx.graph, nodeIds, frame.x - sourceBox.x, frame.y - sourceBox.y)
      const box = canvasBounds(ctx.graph, items)
      const fromFrame = sourceBox !== null
      translateOnCanvas(
        ctx.graph,
        nodeIds,
        centringShift(box.x, box.width, frame.x, frame.width, fromFrame),
        centringShift(box.y, box.height, frame.y, frame.height, fromFrame)
      )
    }

    const view = viewportRect()
    if (!view) return
    const box = canvasBounds(ctx.graph, nodesOf(nodeIds))
    if (!overlaps(box, view)) {
      translateOnCanvas(
        ctx.graph,
        nodeIds,
        view.x + (view.width - box.width) / 2 - box.x,
        view.y + (view.height - box.height) / 2 - box.y
      )
    }
  }

  /** Centers layers on a canvas point, through their parents' rotation and flips. */
  function centerNodesAtCanvasPoint(nodeIds: string[], point: Vector) {
    const items = nodesOf(nodeIds)
    if (items.length === 0) return
    const box = canvasBounds(ctx.graph, items)
    translateOnCanvas(
      ctx.graph,
      nodeIds,
      point.x - (box.x + box.width / 2),
      point.y - (box.y + box.height / 2)
    )
  }

  return {
    centerNodesAtCanvasPoint,
    duplicatePosition,
    keepCanvasTransforms,
    placeForeignPaste,
    placePasted
  }
}
