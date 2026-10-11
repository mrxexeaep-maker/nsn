import type { Editor } from '@open-pencil/core/editor'
import {
  fontManager,
  toggleBoldInRange,
  toggleDecorationInRange,
  toggleItalicInRange
} from '@open-pencil/core/text'
import type { SceneNode } from '@open-pencil/scene-graph'

export function createTextFormattingActions(store: Editor) {
  function applyFormatting(nodeId: string, changes: Partial<SceneNode>, label: string) {
    store.runTextEditStep(() => store.updateNodeWithUndo(nodeId, changes, label))
    const updated = store.graph.getNode(nodeId)
    if (updated) store.textEditor?.rebuildParagraph(updated)
    store.requestRender()
  }

  // A family without the face the toggle would set is left as it is, as in Figma.
  function toggleBold(node: SceneNode) {
    const editor = store.textEditor
    const range = editor?.getSelectionRange()
    if (range) {
      const { runs, newWeight } = toggleBoldInRange(
        node.styleRuns,
        range[0],
        range[1],
        node.fontWeight,
        node.text.length
      )
      if (!fontManager.offersFace(node.fontFamily, newWeight, node.italic)) return
      applyFormatting(node.id, { styleRuns: runs }, 'Toggle bold')
    } else {
      const fontWeight = node.fontWeight >= 700 ? 400 : 700
      if (!fontManager.offersFace(node.fontFamily, fontWeight, node.italic)) return
      applyFormatting(node.id, { fontWeight }, 'Toggle bold')
    }
  }

  function toggleItalic(node: SceneNode) {
    const editor = store.textEditor
    const range = editor?.getSelectionRange()
    if (range) {
      const { runs, newItalic } = toggleItalicInRange(
        node.styleRuns,
        range[0],
        range[1],
        node.italic,
        node.text.length
      )
      if (!fontManager.offersFace(node.fontFamily, node.fontWeight, newItalic)) return
      applyFormatting(node.id, { styleRuns: runs }, 'Toggle italic')
    } else {
      if (!fontManager.offersFace(node.fontFamily, node.fontWeight, !node.italic)) return
      applyFormatting(node.id, { italic: !node.italic }, 'Toggle italic')
    }
  }

  function toggleUnderline(node: SceneNode) {
    const editor = store.textEditor
    const range = editor?.getSelectionRange()
    if (range) {
      const { runs } = toggleDecorationInRange(
        node.styleRuns,
        range[0],
        range[1],
        'UNDERLINE',
        node.textDecoration,
        node.text.length
      )
      applyFormatting(node.id, { styleRuns: runs }, 'Toggle underline')
    } else {
      applyFormatting(
        node.id,
        { textDecoration: node.textDecoration === 'UNDERLINE' ? 'NONE' : 'UNDERLINE' },
        'Toggle underline'
      )
    }
  }

  return { toggleBold, toggleItalic, toggleUnderline }
}
