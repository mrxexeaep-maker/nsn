import { mapValues } from 'es-toolkit/object'
import * as v from 'valibot'

import { isVariable } from './vars'

/**
 * Parse a value a design JSX script passed, or throw `heading` followed by every problem and
 * where it is, as `v.summarize` lists them. Core words tool arguments the same way.
 */
export function parseScriptInput<S extends v.GenericSchema>(
  heading: string,
  schema: S,
  value: unknown
): v.InferOutput<S> {
  const result = v.safeParse(schema, value)
  if (result.success) return result.output
  throw new Error(`${heading}:\n${v.summarize(result.issues)}`)
}

/** The props of an element read one at a time, each of them optional. */
export type ElementPropsSchema = v.ObjectSchema<v.ObjectEntries, undefined>

/**
 * The props `schema` takes, read from `props`: one that does not fit is left out as if it were
 * not set, since the renderer reports it (`elementPropWarnings`) and goes on.
 */
export function readElementProps<S extends ElementPropsSchema>(
  schema: S,
  props: Readonly<Record<string, unknown>>
): v.InferOutput<S> {
  const fitting = mapValues(schema.entries, (entry, key) =>
    v.is(entry, props[key]) ? props[key] : undefined
  )
  return v.parse(schema, fitting)
}

function quoted(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
}

/** A warning for each prop `props` sets that does not fit `schema`, naming the element. */
export function elementPropWarnings(
  schema: ElementPropsSchema,
  props: Readonly<Record<string, unknown>>,
  element: string
): string[] {
  return Object.entries(schema.entries).flatMap(([key, entry]) => {
    const value = props[key]
    // A `designVar()` resolves to its value before the element reads it.
    if (value === undefined || isVariable(value)) return []
    const result = v.safeParse(entry, value)
    if (result.success) return []
    const [issue] = result.issues
    const source = `${key} ${quoted(value)} on <${element}> is ignored`
    // A reader of its own, such as an enum's, names what it takes.
    if (issue.kind === 'transformation') return [`Unknown ${source}; ${issue.message}.`]
    // A choice of kinds names them; a single type or bound is Valibot's to name.
    if (issue.type === 'union' || issue.type === 'custom')
      return [`Invalid ${source}; ${issue.message}.`]
    return [`Invalid ${source}; expected ${issue.expected}.`]
  })
}
