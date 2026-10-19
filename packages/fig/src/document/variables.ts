import type { NodeChange, VariableDataValuesEntry } from '@open-pencil/kiwi/fig/codec'
import { guidToString } from '@open-pencil/kiwi/fig/guid'
import {
  createDefaultSourceMetadata,
  type SceneGraph,
  type VariableValue,
  type UnresolvedVariable
} from '@open-pencil/scene-graph'

import { extractPluginData } from '../node-change/plugin-data'
import { visitVariableReferences } from '../node-change/variable/expression'
import { readVariableMetadata } from '../node-change/variable/metadata'
import {
  readModeAttribute,
  readModeConditions,
  readVariableToken,
  withoutTokenPluginData
} from '../node-change/variable/token'
import { createResourceResolver } from './resource-reference'

export interface UnsupportedVariableExpressionDiagnostic {
  sourceId: string
  modeId: string
  reason: 'unsupported-variable-expression'
}

type ExpressionReporter = (diagnostic: UnsupportedVariableExpressionDiagnostic) => void

function valueOf(
  entry: VariableDataValuesEntry,
  resolve: ReturnType<typeof createResourceResolver>
): VariableValue {
  const { value, dataType, resolvedDataType } = entry.variableData
  if (!value) throw new Error('Missing variable value')
  const type = dataType ?? resolvedDataType
  if (type === 'ALIAS') {
    const aliasId = resolve(value.alias)
    if (!aliasId) throw new Error('Unresolved variable alias')
    return { aliasId }
  }
  if (type === 'COLOR' && value.colorValue) return structuredClone(value.colorValue)
  if (type === 'BOOLEAN' && value.boolValue !== undefined) return value.boolValue
  if (type === 'STRING' && value.textValue !== undefined) return value.textValue
  if (type === 'FLOAT' && value.floatValue !== undefined) return value.floatValue
  throw new Error(`Unsupported variable value ${type}`)
}

function modeValues(
  resource: NodeChange,
  modes: readonly string[],
  resolve: ReturnType<typeof createResourceResolver>
): Record<string, VariableValue> {
  const entries = resource.variableDataValues?.entries ?? []
  if (!entries.length) throw new Error('Missing mode values')
  const values: Record<string, VariableValue> = {}
  for (const entry of entries) {
    const modeId = guidToString(entry.modeID)
    if (!modes.includes(modeId)) throw new Error('Unknown mode')
    values[modeId] = valueOf(entry, resolve)
  }
  return values
}

/** No invented values or fallback collections: unsupported resources remain explicit. */
export function materializeVariableResources(
  graph: SceneGraph,
  resources: readonly NodeChange[],
  onUnsupported?: (resource: NodeChange) => void,
  onUnsupportedExpression?: ExpressionReporter
): void {
  const report = (resource: NodeChange, reason: string): void => {
    if (!onUnsupported) throw new Error(`Unsupported document resource ${resource.type}: ${reason}`)
    onUnsupported(structuredClone(resource))
  }
  for (const resource of resources) {
    if (resource.type !== 'VARIABLE_SET') continue
    const modes = resource.variableSetModes ?? []
    if (!resource.guid || modes.length === 0) {
      report(resource, 'missing collection identity or modes')
      continue
    }
    const pluginData = withoutTokenPluginData(extractPluginData(resource))
    const conditions = readModeConditions(resource)
    graph.addCollection({
      id: guidToString(resource.guid),
      name: resource.name ?? 'Variables',
      modes: modes.map((mode) => {
        const modeId = guidToString(mode.id)
        return {
          modeId,
          name: mode.name,
          condition: conditions[modeId],
          ...(mode.sortPosition ? { sortPosition: mode.sortPosition } : {})
        }
      }),
      defaultModeId: guidToString(modes[0].id),
      variableIds: [],
      modeAttribute: readModeAttribute(resource),
      pluginData: pluginData.length > 0 ? pluginData : undefined,
      key: typeof resource.key === 'string' ? resource.key : undefined,
      version: typeof resource.version === 'string' ? resource.version : undefined
    })
  }
  addVariables(graph, resources, report, onUnsupportedExpression)
}

function unresolvedValues(
  entries: readonly VariableDataValuesEntry[],
  modes: readonly string[],
  resolve: ReturnType<typeof createResourceResolver>,
  importedIds: string[]
): UnresolvedVariable {
  const dependencies = new Set<string>()
  const coverage = { complete: true }
  const visit = (reference: Parameters<typeof resolve>[0]) => {
    const id = resolve(reference)
    if (id) dependencies.add(id)
    else coverage.complete = false
  }
  for (const entry of entries) {
    if (!modes.includes(guidToString(entry.modeID))) throw new Error('Unknown mode')
    if (entry.variableData.dataType === 'EXPRESSION') {
      if (!entry.variableData.value?.expressionValue?.expressionFunction)
        throw new Error('Missing variable expression value')
      if (!visitVariableReferences(entry.variableData, visit)) coverage.complete = false
    } else {
      const value = valueOf(entry, resolve)
      if (typeof value === 'object' && 'aliasId' in value) dependencies.add(value.aliasId)
    }
  }
  return {
    reason: 'unsupported-expression',
    dependencies: [...dependencies],
    referencesComplete: coverage.complete,
    ...(!coverage.complete ? { importedIds } : {})
  }
}

function variableCollectionId(
  resource: NodeChange,
  resolve: ReturnType<typeof createResourceResolver>
) {
  if (resource.variableSetID) return resolve(resource.variableSetID)
  return resource.parentIndex?.guid && guidToString(resource.parentIndex.guid)
}

function unresolvedSource(resource: NodeChange) {
  const source = createDefaultSourceMetadata()
  source.format = 'fig'
  source.id = resource.guid ? guidToString(resource.guid) : null
  source.fig.rawNodeFields = structuredClone(resource)
  return source
}

function addVariables(
  graph: SceneGraph,
  resources: readonly NodeChange[],
  report: (resource: NodeChange, reason: string) => void,
  onUnsupportedExpression?: ExpressionReporter
): void {
  const resolve = createResourceResolver(resources)
  const importedIds = resources.flatMap((record) =>
    record.guid && (record.type === 'VARIABLE' || record.type === 'VARIABLE_SET')
      ? [
          guidToString(record.guid),
          ...(record.variableSetModes?.map((mode) => guidToString(mode.id)) ?? [])
        ]
      : []
  )
  for (const resource of resources) {
    if (resource.type !== 'VARIABLE') continue
    const type = resource.variableResolvedType
    const collectionId = variableCollectionId(resource, resolve)
    const collection = collectionId && graph.variableCollections.get(collectionId)
    if (
      !resource.guid ||
      !collection ||
      !collectionId ||
      (type !== 'COLOR' && type !== 'BOOLEAN' && type !== 'STRING' && type !== 'FLOAT')
    ) {
      report(resource, 'unresolved collection, identity or type')
      continue
    }
    const valuesByMode: Record<string, VariableValue> = {}
    let unresolved: UnresolvedVariable | undefined
    try {
      const entries = resource.variableDataValues?.entries ?? []
      const expressions = entries.filter((entry) => entry.variableData.dataType === 'EXPRESSION')
      if (expressions.length && onUnsupportedExpression) {
        unresolved = unresolvedValues(
          entries,
          collection.modes.map((mode) => mode.modeId),
          resolve,
          importedIds
        )
        for (const entry of expressions)
          onUnsupportedExpression({
            sourceId: guidToString(resource.guid),
            modeId: guidToString(entry.modeID),
            reason: 'unsupported-variable-expression'
          })
      } else
        Object.assign(
          valuesByMode,
          modeValues(
            resource,
            collection.modes.map((mode) => mode.modeId),
            resolve
          )
        )
    } catch (error) {
      report(resource, error instanceof Error ? error.message : 'Invalid mode value')
      continue
    }
    const source = unresolved ? unresolvedSource(resource) : undefined
    const metadata = readVariableMetadata(resource)
    graph.addVariable({
      id: guidToString(resource.guid),
      name: resource.name ?? 'Variable',
      type,
      collectionId,
      valuesByMode,
      unresolved,
      source,
      ...metadata,
      ...readVariableToken(resource, valuesByMode)
    })
  }
}
