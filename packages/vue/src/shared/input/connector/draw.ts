import type { AttachModifiers, Editor } from '@open-pencil/core'

import { isPastPointerDragThreshold } from '#vue/shared/input/drag-threshold'
import type { DragConnectorDraw, DragState } from '#vue/shared/input/types'

/** How the keys held on a pointer event change where a connector end attaches. */
export function attachModifiers(e: MouseEvent): AttachModifiers {
  return { pin: e.metaKey || e.ctrlKey, centre: e.shiftKey }
}

/** Starts a connector at the press, or ends the one a click started, as FigJam's tool does. */
export function startConnectorDraw(
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  editor: Editor,
  setDrag: (drag: DragState) => void,
  modifiers: AttachModifiers
) {
  editor.connectorBegin(cx, cy, modifiers)
  const drag: DragConnectorDraw = {
    type: 'connector-draw',
    startSX: sx,
    startSY: sy,
    moved: false,
    x: cx,
    y: cy,
    modifiers,
    commit: () => editor.connectorRelease(drag.x, drag.y, drag.moved, drag.modifiers),
    cancel: () => editor.connectorCancel()
  }
  setDrag(drag)
}

export function handleConnectorDrawMove(
  drag: DragConnectorDraw,
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  editor: Editor,
  modifiers: AttachModifiers
) {
  drag.x = cx
  drag.y = cy
  drag.modifiers = modifiers
  drag.moved ||= isPastPointerDragThreshold(drag.startSX, drag.startSY, sx, sy)
  if (drag.moved) editor.connectorDrag(cx, cy, modifiers)
}
