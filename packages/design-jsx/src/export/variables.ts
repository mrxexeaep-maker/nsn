import { isEqual } from 'es-toolkit'
import { camelCase } from 'es-toolkit/string'

import { jsx } from '@open-pencil/emit'
import type {
  SceneGraph,
  Variable,
  VariableCollection,
  VariableValue
} from '@open-pencil/scene-graph'
import { modesDefaultFirst } from '@open-pencil/scene-graph/variables'

import { layersUnder } from '../connectors'
import { DESIGN_JSX_HELPERS } from '../definitions'
import { DESIGN_JSX_ELEMENTS } from '../elements'
import { DEFAULT_MODE_NAME } from '../variables'
import { formatColor } from './helpers'
import { helperCall, Reference, valueSyntax, type JSXValue } from './value'

/** How an export writes the variables its layers bind and the modes they pin. */
export interface VariableExport {
  variable(variableId: string): JSXValue
  mode(collectionId: string, modeId: string): JSXValue
  /** The `defineVars` and `defineMode` statements the JSX refers to, if it declares any. */
  declarations(): string
}

/**
 * Variables and modes by reference to the document's own, as `designVar` and `designMode` find
 * them: by name when it is unique, then by collection and name, and by ID otherwise.
 */
export function variableReferences(graph: SceneGraph): VariableExport {
  const collections = [...graph.variableCollections.values()]
  const variables = [...graph.variables.values()]
  return {
    variable(variableId) {
      const variable = graph.variables.get(variableId)
      if (!variable) return variableId
      const sameName = variables.filter((item) => item.name === variable.name)
      if (sameName.length === 1) return helperCall('designVar', variable.name)
      const collection = graph.variableCollections.get(variable.collectionId)
      const unique =
        collection &&
        collections.filter((item) => item.name === collection.name).length === 1 &&
        sameName.filter((item) => item.collectionId === variable.collectionId).length === 1
      return unique ? helperCall('designVar', collection.name, variable.name) : variableId
    },
    mode(collectionId, modeId) {
      const collection = graph.variableCollections.get(collectionId)
      const mode = collection?.modes.find((item) => item.modeId === modeId)
      if (!collection || !mode) return modeId
      const unique = collections.filter((item) => item.name === collection.name).length === 1
      return helperCall('designMode', unique ? collection.name : collection.id, mode.name)
    },
    declarations: () => ''
  }
}

/** The variables the layers under `rootIds` bind. */
function boundVariableIds(graph: SceneGraph, rootIds: readonly string[]): Set<string> {
  return new Set(
    layersUnder(graph, rootIds).flatMap((layer) => Object.values(layer.boundVariables))
  )
}

/** A value `defineVars` can write: a color, a number, a boolean, or an alias. */
function definable(variable: Variable): boolean {
  if (variable.type === 'STRING') return false
  return Object.values(variable.valuesByMode).every(
    (value) =>
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      (typeof value === 'object' && ('aliasId' in value || 'r' in value))
  )
}

const TAKEN = new Set([
  ...DESIGN_JSX_ELEMENTS.map((element) => element.name),
  ...DESIGN_JSX_HELPERS.map((helper) => helper.name),
  'svg',
  'React'
])

function handleName(name: string, taken: Set<string>, fallback: string): string {
  const camel = camelCase(name)
  const base = /^[A-Za-z_$][\w$]*$/.test(camel) ? camel : fallback
  let candidate = base
  for (let count = 2; taken.has(candidate); count++) candidate = `${base}${count}`
  taken.add(candidate)
  return candidate
}

interface DefinedCollection {
  collection: VariableCollection
  name: string
  variables: Variable[]
  /** Handles for the modes after the first, by mode ID. */
  modes: Map<string, string>
}

/**
 * Writes the collections the layers use as `defineVars`, with a `defineMode` for each mode after
 * the first, so the JSX carries its tokens: only the variables it binds and those they alias.
 * Variables JSX cannot define, such as formulas, and collections whose name is not unique are
 * written by reference.
 */
function definitionExport(graph: SceneGraph, rootIds: readonly string[]): VariableExport {
  const references = variableReferences(graph)
  const variableIds = boundVariableIds(graph, rootIds)
  const collectionNames = [...graph.variableCollections.values()].map((item) => item.name)
  const included = new Set<string>()
  const include = (variableId: string) => {
    const variable = graph.variables.get(variableId)
    if (!variable || included.has(variableId) || !definable(variable)) return
    const collection = graph.variableCollections.get(variable.collectionId)
    if (!collection || collectionNames.filter((name) => name === collection.name).length > 1) return
    included.add(variableId)
    for (const value of Object.values(variable.valuesByMode)) {
      if (typeof value === 'object' && 'aliasId' in value) include(value.aliasId)
    }
  }
  for (const id of variableIds) include(id)

  // A collection is declared after the ones its first mode aliases, as its values refer to them.
  const byCollection = new Map<string, Variable[]>()
  for (const id of included) {
    const variable = graph.variables.get(id)
    if (!variable) continue
    byCollection.set(variable.collectionId, [
      ...(byCollection.get(variable.collectionId) ?? []),
      variable
    ])
  }
  // Variables are written in their collection's order, as the variables panel lists them.
  for (const [collectionId, variables] of byCollection) {
    const listed = graph.variableCollections.get(collectionId)?.variableIds ?? []
    variables.sort((a, b) => listed.indexOf(a.id) - listed.indexOf(b.id))
  }
  const order: string[] = []
  const visiting = new Set<string>()
  const visit = (collectionId: string) => {
    if (order.includes(collectionId) || visiting.has(collectionId)) return
    visiting.add(collectionId)
    const collection = graph.variableCollections.get(collectionId)
    for (const variable of byCollection.get(collectionId) ?? []) {
      const value = collection && variable.valuesByMode[collection.defaultModeId]
      if (typeof value === 'object' && 'aliasId' in value) {
        const target = graph.variables.get(value.aliasId)
        if (target) visit(target.collectionId)
      }
    }
    order.push(collectionId)
  }
  for (const id of byCollection.keys()) visit(id)

  const taken = new Set(TAKEN)
  const defined = new Map<string, DefinedCollection>()
  for (const collectionId of order) {
    const collection = graph.variableCollections.get(collectionId)
    if (!collection) continue
    defined.set(collectionId, {
      collection,
      name: handleName(collection.name, taken, 'vars'),
      variables: byCollection.get(collectionId) ?? [],
      modes: new Map()
    })
  }
  for (const entry of defined.values()) {
    for (const mode of modesDefaultFirst(entry.collection).slice(1)) {
      entry.modes.set(mode.modeId, handleName(mode.name, taken, `${entry.name}Mode`))
    }
  }

  const variable = (variableId: string): JSXValue => {
    const found = graph.variables.get(variableId)
    const entry = found && included.has(variableId) ? defined.get(found.collectionId) : undefined
    return entry && found ? new Reference(entry.name, found.name) : references.variable(variableId)
  }
  const value = (raw: VariableValue | undefined): JSXValue | undefined => {
    if (typeof raw === 'number' || typeof raw === 'boolean') return raw
    if (typeof raw !== 'object') return undefined
    if ('aliasId' in raw) return variable(raw.aliasId)
    return 'r' in raw ? formatColor(raw, raw.a) : undefined
  }
  const values = (variables: Variable[], modeId: string, base?: string) =>
    Object.fromEntries(
      variables.flatMap((item) => {
        const written = value(item.valuesByMode[modeId])
        const first = base === undefined ? undefined : value(item.valuesByMode[base])
        if (written === undefined) return []
        if (base !== undefined && isEqual(written, first)) return []
        return [[item.name, written]]
      })
    )

  return {
    variable,
    mode(collectionId, modeId) {
      const name = defined.get(collectionId)?.modes.get(modeId)
      return name ? new Reference(name) : references.mode(collectionId, modeId)
    },
    declarations() {
      // Written as `ref()` declarations are, so the statements read like the JSX after them.
      const statements: string[] = []
      const declare = (name: string, value: JSXValue) =>
        statements.push(`const ${name} = ${jsx.printJSX(valueSyntax(value))}`)
      for (const entry of defined.values()) {
        const [first] = modesDefaultFirst(entry.collection)
        const options = first.name === DEFAULT_MODE_NAME ? undefined : { mode: first.name }
        const call = helperCall(
          'defineVars',
          entry.collection.name,
          values(entry.variables, first.modeId),
          options
        )
        declare(entry.name, call)
      }
      for (const entry of defined.values()) {
        const [first] = modesDefaultFirst(entry.collection)
        for (const [modeId, name] of entry.modes) {
          const mode = entry.collection.modes.find((item) => item.modeId === modeId)
          const call = helperCall(
            'defineMode',
            new Reference(entry.name),
            mode?.name ?? '',
            values(entry.variables, modeId, first.modeId)
          )
          declare(name, call)
        }
      }
      return statements.join('\n')
    }
  }
}

/**
 * How an export writes variables: with `declare`, as the definitions its JSX carries, otherwise
 * by reference to the document's own.
 */
export function variableExport(
  graph: SceneGraph,
  rootIds: readonly string[],
  declare: boolean
): VariableExport {
  return declare ? definitionExport(graph, rootIds) : variableReferences(graph)
}
