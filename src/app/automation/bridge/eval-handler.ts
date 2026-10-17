import { withoutDocumentWrites } from '@open-pencil/core/editor'
import type { FigmaAPI } from '@open-pencil/core/figma-api'
import { compileScript } from '@open-pencil/core/tools'

import type { AutomationTarget } from '@/app/automation/bridge/target'
import { automationUndoLabel, executeWithDocumentUndo } from '@/app/automation/execution/editor'
import { ensureGraphFonts } from '@/app/editor/fonts'

type FigmaFactory = (store: AutomationTarget['store'], pageId?: string) => FigmaAPI

export function createAutomationEvalHandler(makeFigma: FigmaFactory) {
  return async function handleEval(target: AutomationTarget, args: unknown): Promise<unknown> {
    const code = (args as { code?: string }).code
    if (!code) throw new Error('Missing "code" in args')
    const figma = makeFigma(target.store, target.pageId)
    const run = compileScript(code)
    // A script on a read-only document reads it and fails on its first write, as in Figma.
    if (target.store.state.readOnly) {
      const result = await withoutDocumentWrites(target.store.graph, () => run(figma))
      return { ok: true, result: result ?? null }
    }
    const result = await executeWithDocumentUndo(
      target.store,
      target.pageId,
      automationUndoLabel('eval'),
      () =>
        target.store.runMutationWithLayout(
          () => run(figma),
          target.pageId,
          async () => {
            const page = target.store.graph.getNode(target.pageId)
            if (page)
              await ensureGraphFonts(target.store.graph, page.childIds, target.store.renderer)
          }
        )
    )
    target.store.requestRender()
    return { ok: true, result: result ?? null }
  }
}
