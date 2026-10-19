import * as v from 'valibot'

import type { NodeChange, VariableDataEntry } from '@open-pencil/kiwi/fig/codec'
import type { Variable } from '@open-pencil/scene-graph'

import { visitVariableReferences } from './expression'

const guid = v.looseObject({
  sessionID: v.pipe(v.number(), v.integer(), v.minValue(0)),
  localID: v.pipe(v.number(), v.integer(), v.minValue(0))
})
const reference = v.looseObject({
  guid: v.optional(guid),
  assetRef: v.optional(v.object({ key: v.string(), version: v.optional(v.string()) }))
})
const data: v.GenericSchema<VariableDataEntry> = v.lazy(() =>
  v.looseObject({
    dataType: v.optional(v.string()),
    resolvedDataType: v.optional(v.string()),
    value: v.optional(
      v.looseObject({
        alias: v.optional(reference),
        mapValue: v.optional(
          v.looseObject({
            values: v.optional(
              v.array(
                v.looseObject({
                  key: v.optional(v.string()),
                  guidKey: v.optional(guid),
                  value: v.optional(data)
                })
              )
            )
          })
        ),
        colorArrayValue: v.optional(v.looseObject({ colors: v.optional(v.array(data)) })),
        fontStyleValue: v.optional(
          v.looseObject({
            asString: v.optional(data),
            asFloat: v.optional(data),
            asVariations: v.optional(data)
          })
        ),
        boolValue: v.optional(v.boolean()),
        floatValue: v.optional(v.number()),
        textValue: v.optional(v.string()),
        colorValue: v.optional(
          v.object({ r: v.number(), g: v.number(), b: v.number(), a: v.number() })
        ),
        expressionValue: v.optional(
          v.looseObject({
            expressionFunction: v.string(),
            expressionArguments: v.optional(v.array(data))
          })
        )
      })
    )
  })
)
const record = v.looseObject({
  guid,
  type: v.literal('VARIABLE'),
  variableResolvedType: v.picklist(['COLOR', 'FLOAT', 'STRING', 'BOOLEAN']),
  variableSetID: v.optional(reference),
  parentIndex: v.optional(v.looseObject({ guid, position: v.string() })),
  variableDataValues: v.looseObject({
    entries: v.pipe(v.array(v.looseObject({ modeID: guid, variableData: data })), v.minLength(1))
  })
})

/** Read public source metadata defensively; it can have passed through recovery or collaboration. */
export function preservedVariableRecord(variable: Variable): NodeChange {
  const raw = variable.source?.fig.rawNodeFields
  // Bound the tree before recursive validation, including cycles in an in-process caller's state.
  const pending: Array<{ value: unknown; depth: number }> = [{ value: raw, depth: 0 }]
  let count = 0
  while (pending.length) {
    const item = pending.pop()
    if (!item) break
    if (++count > 100000 || item.depth > 256) throw new Error('Invalid preserved variable record')
    if (item.value && typeof item.value === 'object')
      for (const value of Object.values(item.value)) pending.push({ value, depth: item.depth + 1 })
  }
  const parsed = v.safeParse(record, raw)
  if (!parsed.success || (!parsed.output.variableSetID && !parsed.output.parentIndex))
    throw new Error('Invalid preserved variable record')
  for (const entry of parsed.output.variableDataValues.entries)
    visitVariableReferences(entry.variableData, () => undefined)
  return parsed.output
}
