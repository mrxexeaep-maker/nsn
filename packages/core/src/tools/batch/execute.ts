import { captureGraphCheckpoint } from '@open-pencil/scene-graph'

import type { FigmaAPI } from '#core/figma-api'

export const MAX_TOOL_BATCH_ITEMS = 200

/** Synchronous document work shares one checkpoint; the host owns layout and undo. */
export function executeMutationBatch<T>(
  figma: FigmaAPI,
  items: readonly T[],
  execute: (item: T, index: number) => unknown
): unknown[] {
  const checkpoint = captureGraphCheckpoint(figma.graph, { incremental: true })
  let index = 0
  try {
    return items.map((item, itemIndex) => {
      index = itemIndex
      const result = execute(item, index)
      if (result instanceof Promise) throw new Error('Batch mutations must be synchronous')
      if (result && typeof result === 'object' && 'error' in result)
        throw new Error(String(result.error))
      return result
    })
  } catch (error) {
    checkpoint.restore()
    throw new Error(
      `Batch item ${index + 1} failed; no batch changes were kept: ${error instanceof Error ? error.message : String(error)}`
    )
  } finally {
    checkpoint.dispose()
  }
}
