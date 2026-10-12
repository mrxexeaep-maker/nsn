import { findInstanceAncestor, setInstanceOverride } from '@open-pencil/scene-graph'

import { assertNodeEditable } from '#core/editor/capabilities'
import { applyBoundVisibilityEdit } from '#core/editor/components/authoring/visibility-edit'
import type { EditorContext } from '#core/editor/types'

export function createStructureStateActions(ctx: EditorContext) {
  function toggleNodeVisibility(id: string) {
    assertNodeEditable(ctx.graph, id)
    const node = ctx.graph.getNode(id)
    if (!node) return
    const owner = findInstanceAncestor(ctx.graph, id)
    if (owner) setInstanceOverride(owner.instanceOverrides, owner.id, id, 'visible', true)
    const visible = !node.visible
    ctx.graph.updateNode(id, { visible })
    if (owner) applyBoundVisibilityEdit(ctx, id, visible)
    if (node.parentId) ctx.runLayoutForNode(node.parentId)
  }

  function toggleNodeLock(id: string) {
    assertNodeEditable(ctx.graph, id)
    const node = ctx.graph.getNode(id)
    if (!node) return
    ctx.graph.updateNode(id, { locked: !node.locked })
  }

  function toggleVisibility() {
    for (const id of ctx.state.selectedIds) assertNodeEditable(ctx.graph, id)
    for (const id of ctx.state.selectedIds) toggleNodeVisibility(id)
  }

  function toggleLock() {
    for (const id of ctx.state.selectedIds) assertNodeEditable(ctx.graph, id)
    for (const id of ctx.state.selectedIds) toggleNodeLock(id)
  }

  return { toggleNodeVisibility, toggleNodeLock, toggleVisibility, toggleLock }
}
