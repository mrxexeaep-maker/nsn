/** Bound combined inspection output so a batch cannot flood the model context. */
export const MAX_BATCH_READ_LENGTH = 48_000

export function executeReadBatch<T>(
  items: readonly T[],
  execute: (item: T, index: number) => { index: number; id?: unknown; result: unknown },
  identify: (item: T) => unknown
) {
  const results: Record<string, unknown>[] = []
  let remaining = MAX_BATCH_READ_LENGTH
  for (const [index, item] of items.entries()) {
    let entry: Record<string, unknown>
    try {
      entry = execute(item, index)
      const result = entry.result
      if (result && typeof result === 'object' && 'error' in result)
        throw new Error(String(result.error))
      if (JSON.stringify(entry).length > remaining)
        throw new Error(
          'Result exceeds the batch output budget; request this target separately with a smaller depth or scope'
        )
    } catch (error) {
      entry = {
        index,
        id: identify(item),
        error: error instanceof Error ? error.message : String(error)
      }
    }
    const size = JSON.stringify(entry).length + 1
    if (size > remaining) break
    results.push(entry)
    remaining -= size
  }
  return { results, omitted: items.length - results.length }
}
