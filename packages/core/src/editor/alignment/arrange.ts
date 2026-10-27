import {
  captureDocumentChange,
  isEmptyDocumentChange,
  restoreDocumentChange
} from '#core/editor/history/document-change'
import type { EditorContext } from '#core/editor/types'
import {
  arrangeLayers,
  type ArrangeLayersOptions,
  type LayerArrangement
} from '#core/layout/arrange/layers'

export function createArrangeActions(ctx: EditorContext) {
  /**
   * Arranges layers with one of ELK's layouts, along the connectors joining them, as one undo
   * step that also covers the sections it resizes and the connectors it reroutes. Rejects, having
   * moved nothing, when the layers cannot be arranged together or change while the layout runs.
   */
  async function arrangeNodes(
    nodeIds: string[],
    options: ArrangeLayersOptions
  ): Promise<LayerArrangement> {
    const finish = captureDocumentChange(ctx.graph, ctx.state.currentPageId)
    try {
      return await arrangeLayers(ctx.graph, nodeIds, options)
    } finally {
      const change = finish()
      if (!isEmptyDocumentChange(change)) {
        ctx.undo.push({
          label: 'Arrange',
          forward: () => restoreDocumentChange(ctx, change, 'after'),
          inverse: () => restoreDocumentChange(ctx, change, 'before')
        })
      }
      ctx.requestRender()
    }
  }

  return { arrangeNodes }
}
