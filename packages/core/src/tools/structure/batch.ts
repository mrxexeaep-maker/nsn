import * as v from 'valibot'

import { executeMutationBatch, MAX_TOOL_BATCH_ITEMS } from '#core/tools/batch/execute'
import { nodeIdInput } from '#core/tools/input'
import { applyPropertyPatch, batchPropertiesInput } from '#core/tools/modify/patch'
import { defineTool } from '#core/tools/schema'

const operationsInput = v.pipe(
  v.array(v.strictObject({ id: nodeIdInput, props: batchPropertiesInput })),
  v.minLength(1),
  v.maxLength(MAX_TOOL_BATCH_ITEMS)
)

export const batchUpdate = defineTool({
  name: 'batch_update',
  description:
    'Apply related property edits in one undo operation. Pass a native operations array of {id, props}; each node can receive different text, font, appearance, or layout values. Uses the same validation and behavior as focused property tools. Invalid properties or a failed item reject the whole batch without retaining partial changes. Legacy JSON-encoded arrays are also accepted.',
  execution: { kind: 'sync', mutation: 'properties' },
  input: v.strictObject({
    operations: v.union([operationsInput, v.pipe(v.string(), v.parseJson(), operationsInput)])
  }),
  execute: (figma, { operations }) => {
    const results = executeMutationBatch(figma, operations, ({ id, props }) =>
      applyPropertyPatch(figma, id, props)
    )
    return { updated: results.length, results }
  }
})
