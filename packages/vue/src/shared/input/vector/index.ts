import { isPastPointerDragThreshold } from '#vue/shared/input/drag-threshold'
import type {
  DragEditHandle,
  DragEditMarquee,
  DragEditNode,
  DragState
} from '#vue/shared/input/types'
import {
  editVerticesInRect,
  getNodeEditState,
  hitTestEditHandle,
  hitTestEditSegment,
  hitTestEditVertex,
  isEndpoint,
  type NodeEditState
} from '#vue/shared/input/vector/hit-test'
import { applyNodeEditSnap } from '#vue/shared/input/vector/snap'

export {
  getNodeEditState,
  hitTestEditHandle,
  hitTestEditSegment,
  isEndpoint,
  NODE_HIT_THRESHOLD
} from '#vue/shared/input/vector/hit-test'
import type { Editor } from '@open-pencil/core/editor'
import { vectorHandleId } from '@open-pencil/core/vector'
import type { Vector } from '@open-pencil/scene-graph/primitives'

type NodeEditEditor = Partial<{
  nodeEditSelectVertex: (vertexIndex: number, addToSelection: boolean) => void
  exitNodeEditMode: (commit: boolean) => void
  nodeEditRemoveVertex: (vertexIndex: number) => void
  penResumeFromEndpoint: (nodeId: string, endpointVertexIndex: number) => void
  nodeEditAddVertex: (cx: number, cy: number) => void
  nodeEditPushHistory: () => void
  nodeEditSetHandle: (
    segmentIndex: number,
    tangentField: 'tangentStart' | 'tangentEnd',
    newTangent: Vector,
    options?: {
      breakMirroring?: boolean
      continuous?: boolean
      lockDirection?: boolean
    }
  ) => void
}>

export function handleNodeEditDown(
  e: MouseEvent,
  cx: number,
  cy: number,
  editor: Editor,
  setDrag: (d: DragState) => void
) {
  const es = getNodeEditState(editor)
  if (!es) return
  const nodeEditEditor = editor as Editor & NodeEditEditor

  const handleHit = hitTestEditHandle(editor, cx, cy)
  if (handleHit) {
    const key = vectorHandleId(handleHit.segmentIndex, handleHit.tangentField)

    if (e.shiftKey) {
      const next = new Set(es.selectedHandles)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      es.selectedHandles = next
    } else {
      es.selectedVertexIndices = new Set()
      es.selectedSegmentIndices = new Set()
      es.selectedHandles = new Set([key])
    }
    nodeEditEditor.nodeEditPushHistory?.()
    setDrag({
      type: 'edit-handle',
      segmentIndex: handleHit.segmentIndex,
      tangentField: handleHit.tangentField,
      vertexIndex: handleHit.vertexIndex,
      startX: cx,
      startY: cy,
      initialTangent: (() => {
        const seg = es.segments[handleHit.segmentIndex]
        const tangent =
          handleHit.tangentField === 'tangentStart' ? seg.tangentStart : seg.tangentEnd
        return { x: tangent.x, y: tangent.y }
      })()
    })
    return
  }

  const vi = hitTestEditVertex(editor, cx, cy)
  if (vi !== null) {
    if (!e.shiftKey) es.selectedHandles = new Set()

    if (e.metaKey || e.ctrlKey) {
      nodeEditEditor.nodeEditSelectVertex?.(vi, false)
      nodeEditEditor.nodeEditPushHistory?.()
      setDrag({
        type: 'bend-handle',
        vertexIndex: vi,
        startX: es.vertices[vi].x,
        startY: es.vertices[vi].y,
        lockedMode: null,
        dragSamples: [],
        targetSegmentIndex: null,
        targetTangentField: null
      })
      return
    }

    if (!(es.selectedVertexIndices.has(vi) && !e.shiftKey)) {
      nodeEditEditor.nodeEditSelectVertex?.(vi, e.shiftKey)
    }

    startPointsDrag(es, [vi], cx, cy, nodeEditEditor, setDrag)
    return
  }

  // As in Figma, a press on a segment selects the segment itself, not its endpoints, and drags
  // its two points with the rest of the selection.
  const si = hitTestEditSegment(editor, cx, cy)
  if (si !== null) {
    selectPressedSegment(es, si, e.shiftKey)
    editor.requestRepaint()
    const { start, end } = es.segments[si]
    startPointsDrag(es, [start, end], cx, cy, nodeEditEditor, setDrag)
    return
  }

  // Empty space: a drag selects what it encloses; a click leaves the path, on release.
  setDrag({
    type: 'edit-marquee',
    startX: cx,
    startY: cy,
    baseSelection: e.shiftKey ? new Set(es.selectedVertexIndices) : new Set(),
    baseSegments: e.shiftKey ? new Set(es.selectedSegmentIndices) : new Set()
  })
}

/** Shift toggles the pressed segment; otherwise it replaces the selection unless already in it. */
function selectPressedSegment(es: NodeEditState, segmentIndex: number, toggle: boolean) {
  es.selectedHandles = new Set()
  if (toggle) {
    const next = new Set(es.selectedSegmentIndices)
    if (next.has(segmentIndex)) next.delete(segmentIndex)
    else next.add(segmentIndex)
    es.selectedSegmentIndices = next
  } else if (!es.selectedSegmentIndices.has(segmentIndex)) {
    es.selectedVertexIndices = new Set()
    es.selectedSegmentIndices = new Set([segmentIndex])
  }
}

/** Drags the selected points and segments, and `pressed` with them, from where the pointer went down. */
function startPointsDrag(
  es: NodeEditState,
  pressed: number[],
  cx: number,
  cy: number,
  nodeEditEditor: NodeEditEditor,
  setDrag: (d: DragState) => void
) {
  const segmentEnds = [...es.selectedSegmentIndices].flatMap((index) => {
    const segment = es.segments.at(index)
    return segment ? [segment.start, segment.end] : []
  })
  const origPositions = new Map<number, Vector>()
  for (const index of [...es.selectedVertexIndices, ...segmentEnds, ...pressed]) {
    origPositions.set(index, { x: es.vertices[index].x, y: es.vertices[index].y })
  }
  nodeEditEditor.nodeEditPushHistory?.()
  setDrag({ type: 'edit-node', startX: cx, startY: cy, origPositions })
}

/** Selects the points inside the marquee and the segments between them, with what it started with. */
export function handleNodeEditMarqueeMove(
  d: DragEditMarquee,
  cx: number,
  cy: number,
  editor: Editor
) {
  const es = getNodeEditState(editor)
  if (!es) return
  const marquee = {
    x: Math.min(d.startX, cx),
    y: Math.min(d.startY, cy),
    width: Math.abs(cx - d.startX),
    height: Math.abs(cy - d.startY)
  }
  const enclosed = new Set(editVerticesInRect(editor, marquee))
  const enclosedSegments = es.segments.flatMap((segment, index) =>
    enclosed.has(segment.start) && enclosed.has(segment.end) ? [index] : []
  )
  es.selectedVertexIndices = new Set([...d.baseSelection, ...enclosed])
  es.selectedSegmentIndices = new Set([...d.baseSegments, ...enclosedSegments])
  es.selectedHandles = new Set()
  editor.setMarquee(marquee)
  editor.requestRepaint()
}

/** Ends a marquee over a path being edited; a click without a drag leaves the path. */
export function finishNodeEditMarquee(editor: Editor) {
  const marquee = editor.state.marquee
  const zoom = editor.state.zoom
  editor.setMarquee(null)
  const dragged =
    !!marquee && isPastPointerDragThreshold(0, 0, marquee.width * zoom, marquee.height * zoom)
  if (!dragged) (editor as Editor & NodeEditEditor).exitNodeEditMode?.(true)
}

export function handlePenNodeEditDown(e: MouseEvent, cx: number, cy: number, editor: Editor) {
  const es = getNodeEditState(editor)
  if (!es) return
  const nodeEditEditor = editor as Editor & NodeEditEditor

  const vi = hitTestEditVertex(editor, cx, cy)
  if (vi !== null) {
    if (e.altKey) {
      nodeEditEditor.nodeEditRemoveVertex?.(vi)
      return
    }
    if (isEndpoint(vi, es.segments)) {
      const nodeId = es.nodeId
      nodeEditEditor.exitNodeEditMode?.(true)
      nodeEditEditor.penResumeFromEndpoint?.(nodeId, vi)
    }
    return
  }

  nodeEditEditor.nodeEditAddVertex?.(cx, cy)
}

export function handleNodeEditMove(
  d: DragEditNode | DragEditHandle,
  cx: number,
  cy: number,
  editor: Editor,
  breakMirroring?: boolean,
  continuous?: boolean,
  lockDirection?: boolean,
  disableSnapping?: boolean
) {
  const nodeEditEditor = editor as Editor & NodeEditEditor
  if (d.type === 'edit-node') {
    const unsnappedDx = cx - d.startX
    const unsnappedDy = cy - d.startY
    const es = getNodeEditState(editor)
    if (!es) return
    let snapped = { x: unsnappedDx, y: unsnappedDy }
    if (disableSnapping) editor.setSnapGuides([])
    else snapped = applyNodeEditSnap(d, unsnappedDx, unsnappedDy, editor, es)

    for (const [idx, orig] of d.origPositions) {
      es.vertices[idx] = {
        ...es.vertices[idx],
        x: orig.x + snapped.x,
        y: orig.y + snapped.y
      }
    }
    editor.requestRepaint()
    return
  }
  const es = getNodeEditState(editor)
  if (!es) return
  const vertex = es.vertices[d.vertexIndex]
  let newTangent = { x: cx - vertex.x, y: cy - vertex.y }
  const canLockDirection =
    lockDirection &&
    (vertex.handleMirroring === 'ANGLE' || vertex.handleMirroring === 'ANGLE_AND_LENGTH')
  if (canLockDirection && d.initialTangent) {
    const len = Math.hypot(d.initialTangent.x, d.initialTangent.y)
    if (len > 1e-6) {
      const dir = { x: d.initialTangent.x / len, y: d.initialTangent.y / len }
      const projectedLen = Math.max(0, newTangent.x * dir.x + newTangent.y * dir.y)
      newTangent = { x: dir.x * projectedLen, y: dir.y * projectedLen }
    }
  }
  nodeEditEditor.nodeEditSetHandle?.(d.segmentIndex, d.tangentField, newTangent, {
    breakMirroring,
    continuous,
    lockDirection
  })
}
