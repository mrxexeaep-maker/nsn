import * as v from 'valibot'

import type { GUID, VariableDataEntry } from '@open-pencil/kiwi/fig/codec'

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
/** Visit references without interpreting the function or changing its expression tree. */
export function visitPreservedVariableReferences(
  entry: VariableDataEntry,
  alias: (reference: NonNullable<NonNullable<VariableDataEntry['value']>['alias']>) => void,
  mode: (guid: GUID) => GUID = (guid) => guid
): void {
  const value = entry.value
  if (!value) return
  if (value.alias) alias(value.alias)
  const nested = [
    ...(value.expressionValue?.expressionArguments ?? []),
    ...(value.colorArrayValue?.colors ?? []),
    value.fontStyleValue?.asString,
    value.fontStyleValue?.asFloat,
    value.fontStyleValue?.asVariations
  ]
  for (const item of value.mapValue?.values ?? []) {
    if (item.guidKey) item.guidKey = mode(item.guidKey)
    nested.push(item.value)
  }
  for (const child of nested) if (child) visitPreservedVariableReferences(child, alias, mode)
}

/** Validate recovered opaque trees before writing them back to .fig. */
export function preservedVariableData(raw: unknown): VariableDataEntry {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: raw, depth: 0 }]
  let count = 0
  while (pending.length) {
    const item = pending.pop()
    if (!item) break
    if (++count > 100000 || item.depth > 256)
      throw new Error('Invalid preserved variable expression')
    if (item.value && typeof item.value === 'object')
      for (const value of Object.values(item.value)) pending.push({ value, depth: item.depth + 1 })
  }
  const parsed = v.parse(data, raw)
  if (parsed.dataType !== 'EXPRESSION' || !parsed.value?.expressionValue)
    throw new Error('Invalid preserved variable expression')
  return parsed
}
