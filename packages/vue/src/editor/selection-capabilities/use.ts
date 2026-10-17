import { computed, shallowRef, type ComputedRef } from 'vue'

import { canMakeBooleanSourceNode, hasVisibleStrokeSourceNode } from '@open-pencil/core/canvas'

import { useEditorEvent } from '#vue/editor/events/use'
import { useDocumentReadOnly } from '#vue/editor/read-only/use'
import { useSelectionState } from '#vue/editor/selection-state/use'
import { useSceneComputed } from '#vue/internal/scene-computed/use'

/**
 * Returns reactive booleans describing which selection-dependent actions are
 * currently available.
 *
 * This is useful for menus, toolbars, shortcuts, and action buttons that need
 * command-friendly capability checks.
 */
export function useSelectionCapabilities() {
  const selection = useSelectionState()
  const { editor, selectedIds, selectedNode, selectedCount, hasSelection } = selection
  // A change counter, not the undo manager itself: an editor that follows the active document
  // must answer for the document that is active now.
  const historyVersion = shallowRef(0)
  useEditorEvent('history:changed', () => {
    historyVersion.value++
  })

  // A read-only document keeps copying, exporting, selecting, and navigating; nothing else.
  const readOnly = useDocumentReadOnly()
  const editable = (capability: ComputedRef<boolean>) =>
    computed(() => !readOnly.value && capability.value)

  const selectedNodesCanFlatten = useSceneComputed(() => {
    const nodes = editor.getSelectedNodes()
    return nodes.length > 0 && nodes.every((node) => canMakeBooleanSourceNode(node, editor.graph))
  })

  return {
    selectedIds,
    selectedNode,
    canCopy: computed(() => hasSelection.value),
    canCut: editable(computed(() => hasSelection.value)),
    canPaste: editable(computed(() => true)),
    canDelete: editable(computed(() => hasSelection.value)),
    canDuplicate: editable(computed(() => hasSelection.value)),
    canExportSelection: computed(() => hasSelection.value),
    canGroup: editable(computed(() => selectedCount.value >= 2)),
    canFrameSelection: editable(computed(() => hasSelection.value)),
    canUngroup: editable(computed(() => selection.isGroup.value)),
    canCreateComponent: editable(computed(() => hasSelection.value)),
    canCreateComponentSet: editable(selection.canCreateComponentSet),
    canDetachInstance: editable(computed(() => selection.isInstance.value)),
    canDetachIcon: editable(computed(() => selection.isIcon.value)),
    canWrapInAutoLayout: editable(computed(() => hasSelection.value)),
    canToggleMask: editable(computed(() => hasSelection.value)),
    canBringToFront: editable(computed(() => hasSelection.value)),
    canSendToBack: editable(computed(() => hasSelection.value)),
    canToggleVisibility: editable(computed(() => hasSelection.value)),
    canToggleLock: editable(computed(() => hasSelection.value)),
    canFlip: editable(computed(() => hasSelection.value)),
    canDistribute: editable(
      useSceneComputed(() => editor.canDistributeNodes([...editor.state.selectedIds]))
    ),
    canBooleanOperation: editable(
      computed(() => selectedCount.value >= 2 && selectedNodesCanFlatten.value)
    ),
    canFlatten: editable(computed(() => selectedNodesCanFlatten.value)),
    canOutlineText: editable(
      useSceneComputed(() => {
        const nodes = editor.getSelectedNodes()
        return (
          nodes.length > 0 &&
          nodes.every(
            (node) => node.type === 'TEXT' && canMakeBooleanSourceNode(node, editor.graph)
          )
        )
      })
    ),
    canOutlineStroke: editable(
      useSceneComputed(() => {
        const nodes = editor.getSelectedNodes()
        return (
          nodes.length > 0 &&
          nodes.every(
            (node) =>
              hasVisibleStrokeSourceNode(node, editor.graph) &&
              canMakeBooleanSourceNode(node, editor.graph)
          )
        )
      })
    ),
    canGoToMainComponent: computed(() => selection.isInstance.value),
    canCreateInstance: editable(computed(() => selectedNode.value?.type === 'COMPONENT')),
    canCreateSlot: editable(selection.canCreateSlot),
    canMoveToPage: editable(
      useSceneComputed(() => hasSelection.value && editor.graph.getPages().length > 1)
    ),
    canSetOpacity: editable(computed(() => hasSelection.value)),
    canSelectAll: useSceneComputed(
      () => editor.graph.getChildren(editor.state.currentPageId).length > 0
    ),
    // In vector edit mode, undo/redo route to the session-local history —
    // keep the commands enabled so the shortcut reaches them.
    canUndo: editable(
      useSceneComputed(
        () =>
          historyVersion.value >= 0 && (editor.state.nodeEditState != null || editor.undo.canUndo)
      )
    ),
    canRedo: editable(
      useSceneComputed(
        () =>
          historyVersion.value >= 0 && (editor.state.nodeEditState != null || editor.undo.canRedo)
      )
    ),
    canZoomToSelection: computed(() => hasSelection.value)
  }
}
