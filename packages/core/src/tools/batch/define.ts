import * as v from 'valibot'

import { parseToolArgs, toolChangesDocument, type ToolDef } from '#core/tools/schema'

import { executeMutationBatch, MAX_TOOL_BATCH_ITEMS } from './execute'
import { executeReadBatch } from './read'

type Options = {
  target?: string
  rollbackSingle?: boolean
  readDefaults?: Record<string, unknown>
}

/** Derive batch inputs from the actual single-item schema, for every tool interface. */
export function withBatch(
  def: ToolDef,
  { target, rollbackSingle, readDefaults }: Options = {}
): ToolDef {
  if (def.execution.kind !== 'sync') throw new Error(`${def.name}: async batches need staging`)
  if (target && !def.input.entries[target]) throw new Error(`${def.name}: missing target field`)
  const entries: v.ObjectEntries = {
    ...Object.fromEntries(
      Object.entries(def.input.entries).map(([name, schema]) => [name, v.optional(schema)])
    ),
    items: v.optional(
      v.pipe(
        v.array(def.input),
        v.minLength(1),
        v.maxLength(MAX_TOOL_BATCH_ITEMS),
        v.description(
          'Complete per-item arguments when targets or values differ. Do not combine with shared arguments.'
        )
      )
    )
  }
  if (target)
    entries.ids = v.optional(
      v.pipe(
        v.array(v.string()),
        v.minLength(1),
        v.maxLength(MAX_TOOL_BATCH_ITEMS),
        v.description(`Apply the shared arguments to these ${target} targets instead of one.`)
      )
    )
  const input = v.pipe(
    v.strictObject(entries),
    v.check((args) => {
      const { items, ids, ...shared } = args
      if (items !== undefined) return Object.keys(args).every((key) => key === 'items')
      if (ids !== undefined && target) {
        if (args[target] !== undefined) return false
        const parsed = v.safeParse(v.array(v.string()), ids)
        return (
          parsed.success &&
          parsed.output.every((id) => v.safeParse(def.input, { ...shared, [target]: id }).success)
        )
      }
      return v.safeParse(def.input, args).success
    }, 'Provide required arguments for one item, ids with shared values, or items alone')
  )
  return {
    ...def,
    input,
    description:
      `${def.description} For related operations, prefer one batch: ` +
      (target ? '`ids` with shared values, or ' : '') +
      '`items` with complete per-item arguments. Single-item arguments remain supported. ' +
      (toolChangesDocument(def)
        ? 'A failed batch rolls back all its changes; the batch is one undo operation in the editor.'
        : 'Batch reads return labelled results and per-item errors with a 48,000-character output budget. Keep requested depth and scope small.' +
          (readDefaults ? ` Batch-only defaults: ${JSON.stringify(readDefaults)}.` : '')),
    execute(figma, args) {
      const parsed = parseToolArgs(def.name, input, args)
      const { items, ids, ...shared } = parsed
      if (items !== undefined && Object.keys(args).some((key) => key !== 'items'))
        throw new Error('Use items alone, or shared arguments with ids; do not combine them')
      if (ids !== undefined && target && args[target] !== undefined)
        throw new Error(`Use ids or ${target}, not both`)
      let operations: Record<string, unknown>[] | null = null
      if (items !== undefined) operations = v.parse(v.array(def.input), items)
      else if (ids !== undefined && target)
        operations = [...new Set(v.parse(v.array(v.string()), ids))].map((id) =>
          parseToolArgs(def.name, def.input, { ...shared, [target]: id })
        )
      if (!operations)
        return rollbackSingle
          ? executeMutationBatch(figma, [args], (item) => def.execute(figma, item))[0]
          : def.execute(figma, args)
      const execute = (item: Record<string, unknown>, index: number) => {
        const effective = { ...readDefaults, ...item }
        if (readDefaults)
          for (const [key, value] of Object.entries(readDefaults))
            if (effective[key] === undefined) effective[key] = value
        const result = def.execute(figma, effective)
        let id = target ? item[target] : undefined
        if (!target && result && typeof result === 'object' && 'id' in result) id = result.id
        return { index, ...(id === undefined ? {} : { id }), result }
      }
      if (toolChangesDocument(def)) {
        const results = executeMutationBatch(figma, operations, (item, index) => {
          const entry = execute(item, index)
          if (entry.result && typeof entry.result === 'object' && 'error' in entry.result)
            throw new Error(String(entry.result.error))
          return entry
        })
        return { updated: results.length, results }
      }
      return executeReadBatch(operations, execute, (item) => (target ? item[target] : undefined))
    }
  }
}
