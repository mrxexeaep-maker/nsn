import { expect, test } from 'bun:test'

import { guid } from '#fig-tests/helpers/guid'
import { materializeDocument } from '#fig/document/materialize'
import { preservedVariableData } from '#fig/node-change/variable/preserved'

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
  expect(() => materializeDocument(source)).toThrow(
    'Unsupported variable expression UNKNOWN_FUNCTION'
  )
  const diagnostics: unknown[] = []
  const open = () =>
    materializeDocument(source, [], {
      onUnsupportedVariableExpression: (diagnostic) => diagnostics.push(diagnostic)
    }).graph
  const graph = open()
  expect(diagnostics).toEqual([
    { sourceId: '1:4', modeId: '1:2', reason: 'unsupported-variable-expression' }
  ])
  expect(graph.variables.get('1:4')?.valuesByMode['1:2']).toMatchObject({
    expression: 'UNSUPPORTED',
    references: [],
    value: source[1].variableDataValues?.entries?.[0].variableData
  })
  expect(graph.resolveVariable('1:4', '1:2')).toBeUndefined()
  expect(graph.resolveVariable('1:4', '1:3')).toBe(42)
  graph.removeMode('1:1', '1:3')
  const fresh = graph.createVariable('New', 'FLOAT', '1:1')
  graph.removeVariable(fresh.id)
  expect(graph.variables.has(fresh.id)).toBe(false)
  const entries = source[1].variableDataValues?.entries
  if (!entries) throw new Error('Missing synthetic values')
  for (const expressionFunction of [
    'TERNARY',
    'STRINGIFY',
    'VAR_MODE_LOOKUP',
    'IS_TRUTHY',
    'RESOLVE_VARIANT',
    'KEYFRAME',
    'COMPOSE_COLOR'
  ]) {
    entries[0].variableData.value = {
      expressionValue: { expressionFunction, expressionArguments: [] }
    }
    const preserved = open().variables.get('1:4')?.valuesByMode['1:2']
    expect(preserved).toMatchObject({ expression: 'UNSUPPORTED', value: entries[0].variableData })
  }
  entries[0].variableData.value = {
    expressionValue: {
      expressionFunction: 'ADDITION',
      expressionArguments: [
        { dataType: 'FLOAT', value: { floatValue: 2 } },
        { dataType: 'FLOAT', value: { floatValue: 3 } }
      ]
    }
  }
  expect(open().resolveVariable('1:4', '1:2')).toBe(5)
  entries[1].variableData.value = {}
  expect(open).toThrow('Unsupported variable value FLOAT')
  entries[1].variableData.value = { floatValue: 42 }
  entries[0].variableData.value = {
    expressionValue: {
      expressionFunction: 'UNKNOWN_FUNCTION',
      expressionArguments: [entries[0].variableData]
    }
  }
  expect(open).toThrow('Invalid preserved variable expression')
  const opaque = {
    dataType: 'EXPRESSION',
    value: {
      expressionValue: {
        expressionFunction: 'TERNARY',
        expressionArguments: [
          { value: { colorValue: { r: 1, g: 0, b: 0, a: 1, colorSpace: 'DISPLAY_P3' } } },
          { value: { alias: { assetRef: { key: 'remote', version: 'v1', futureField: true } } } }
        ]
      }
    }
  }
  expect(preservedVariableData(opaque)).toEqual(opaque)
})
