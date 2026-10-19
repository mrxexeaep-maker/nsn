import { expect, test } from 'bun:test'

import { guid } from '#fig-tests/helpers/guid'
import { materializeDocument } from '#fig/document/materialize'

import type { NodeChange } from '@open-pencil/kiwi/fig/codec'

test('only explicit tolerance preserves unsupported variable expressions without evaluating them', () => {
  const source: NodeChange[] = [
    {
      guid: guid(1),
      type: 'VARIABLE_SET',
      variableSetModes: [
        { id: guid(2), name: 'Default' },
        { id: guid(3), name: 'Other' }
      ]
    },
    {
      guid: guid(4),
      type: 'VARIABLE',
      variableResolvedType: 'FLOAT',
      variableSetID: { guid: guid(1) },
      variableDataValues: {
        entries: [
          {
            modeID: guid(2),
            variableData: {
              dataType: 'EXPRESSION',
              value: {
                expressionValue: { expressionFunction: 'UNKNOWN_FUNCTION', expressionArguments: [] }
              }
            }
          },
          { modeID: guid(3), variableData: { dataType: 'FLOAT', value: { floatValue: 42 } } }
        ]
      }
    }
  ]
  expect(() => materializeDocument(source)).toThrow('Unsupported variable value EXPRESSION')
  const diagnostics: unknown[] = []
  const open = () =>
    materializeDocument(source, [], {
      onUnsupportedVariableExpression: (diagnostic) => diagnostics.push(diagnostic)
    }).graph
  const graph = open()
  expect(diagnostics).toEqual([
    { sourceId: '1:4', modeId: '1:2', reason: 'unsupported-variable-expression' }
  ])
  expect(graph.variables.get('1:4')?.valuesByMode).toEqual({})
  expect(graph.resolveVariable('1:4', '1:2')).toBeUndefined()
  expect(graph.resolveVariable('1:4', '1:3')).toBeUndefined()
  expect(graph.variables.get('1:4')?.source?.fig.rawNodeFields).toEqual(source[1])
  expect(() => graph.removeMode('1:1', '1:3')).toThrow('unsupported expressions')
  const unresolved = graph.variables.get('1:4')?.unresolved
  if (!unresolved) throw new Error('Missing preserved expression')
  unresolved.referencesComplete = false
  unresolved.importedIds = []
  const fresh = graph.createVariable('New', 'FLOAT', '1:1')
  unresolved.dependencies.push(fresh.id)
  expect(() => graph.removeVariable(fresh.id)).toThrow('unsupported expression')
  unresolved.dependencies = []
  delete unresolved.importedIds
  expect(() => graph.removeVariable(fresh.id)).toThrow('unsupported expression')
  const entries = source[1].variableDataValues?.entries
  if (!entries) throw new Error('Missing synthetic values')
  entries[1].variableData.value = {}
  expect(open).toThrow('Unsupported variable value FLOAT')
  entries[1].variableData.value = { floatValue: 42 }
  entries[0].variableData.value = {
    expressionValue: {
      expressionFunction: 'UNKNOWN_FUNCTION',
      expressionArguments: [entries[0].variableData]
    }
  }
  expect(open).toThrow('maximum depth')
})
