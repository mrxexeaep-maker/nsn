import { expect, test } from 'bun:test'

import { deflateSync } from 'fflate'

import { compressFigDataSync, parseFigBuffer } from '@open-pencil/fig'
import {
  getCompiledSchema,
  getSchemaBytes,
  type VariableDataEntry,
  type NodeChange
} from '@open-pencil/kiwi/fig/codec'
import { guidToString, stringToGuid } from '@open-pencil/kiwi/fig/guid'
import { SceneGraph } from '@open-pencil/scene-graph'

import { createEditor } from '#core/editor/create'
import { FigmaAPI } from '#core/figma-api'
import { exportFigFile } from '#core/io/formats/fig/export'
import { appendVariableNodeChanges } from '#core/io/formats/fig/export/variables'
import { parseFigFile, parseFigFileViaWorker } from '#core/io/formats/fig/read'
import { deserializeSceneGraph, serializeSceneGraph } from '#core/kiwi/fig/parse/transfer'
import {
  createFigPopulationWorker,
  releaseFigPopulationWorker
} from '#core/kiwi/fig/population/client'
import { populateFigPage, readerDiagnostics } from '#core/kiwi/fig/session/document-state'

function mapOperand(entry: VariableDataEntry | undefined) {
  return entry?.value?.expressionValue?.expressionArguments?.[0].value?.mapValue?.values?.[0]
}

test('tolerant import keeps cached layers, diagnostics and opaque values across recovery and saves', async () => {
  const source = new SceneGraph()
  const collection = source.createCollection('Synthetic')
  const mode = collection.defaultModeId
  const empty = source.createCollection('Empty imported')
  const literal = source.createVariable('Literal', 'FLOAT', collection.id, 18)
  const opaque = source.createVariable('Opaque', 'FLOAT', collection.id, 7)
  for (const page of [source.getPages()[0], source.createNode('CANVAS', source.rootId)]) {
    source.createNode('RECTANGLE', page.id, {
      width: 91,
      height: 70,
      boundVariables: { width: opaque.id }
    })
  }
  const decoded = parseFigBuffer((await exportFigFile(source)).slice().buffer)
  const record = decoded.nodeChanges.find(
    (node) => node.guid && guidToString(node.guid) === opaque.id
  )
  const entry = record?.variableDataValues?.entries?.[0]
  if (!entry) throw new Error('Missing synthetic variable')
  const literalRecord = decoded.nodeChanges.find(
    (node) => node.guid && guidToString(node.guid) === literal.id
  )
  if (!literalRecord?.guid) throw new Error('Missing synthetic dependency')
  entry.variableData = {
    dataType: 'EXPRESSION',
    resolvedDataType: 'FLOAT',
    value: {
      expressionValue: {
        expressionFunction: 'VAR_MODE_LOOKUP',
        expressionArguments: [
          {
            dataType: 'MAP',
            value: {
              mapValue: {
                values: [
                  {
                    guidKey: stringToGuid(empty.defaultModeId),
                    value: { dataType: 'ALIAS', value: { alias: { guid: literalRecord.guid } } }
                  }
                ]
              }
            }
          }
        ]
      }
    }
  }
  for (const node of decoded.nodeChanges)
    if (node.type === 'RECTANGLE') node.size = { x: 91, y: 70 }
  const bytes = compressFigDataSync(
    deflateSync(getSchemaBytes()),
    getCompiledSchema().encodeMessage(decoded),
    new Uint8Array(),
    '{}',
    []
  )
  const graph = await parseFigFileViaWorker(bytes.slice().buffer, { populate: 'first-page' })
  try {
    createFigPopulationWorker(graph)?.terminate()
    populateFigPage(graph, graph.getPages()[1].id)
    expect(readerDiagnostics(graph)).toEqual([
      {
        kind: 'variable-expression',
        diagnostic: {
          sourceId: opaque.id,
          modeId: mode,
          reason: 'unsupported-variable-expression'
        }
      }
    ])
    expect(graph.getPages().map((page) => graph.getChildren(page.id)[0].width)).toEqual([91, 91])
    expect(graph.resolveVariable(opaque.id)).toBeUndefined()
    const remapped: NodeChange[] = []
    appendVariableNodeChanges(
      graph,
      remapped,
      { sessionID: 0, localID: 1 },
      new Map([[literal.id, { sessionID: 99, localID: 1 }]]),
      new Map([[empty.defaultModeId, { sessionID: 99, localID: 2 }]])
    )
    const mappedEntry = remapped.find((node) => node.name === 'Opaque')?.variableDataValues
      ?.entries?.[0].variableData
    expect(mapOperand(mappedEntry)).toMatchObject({
      guidKey: { sessionID: 99, localID: 2 },
      value: { value: { alias: { guid: { sessionID: 99, localID: 1 } } } }
    })
    expect(mapOperand(entry.variableData)?.guidKey).toEqual(stringToGuid(empty.defaultModeId))
    const editor = createEditor({ graph })
    expect(() => editor.updateVariableValue(opaque.id, mode, 9)).toThrow(
      'unsupported variable expression'
    )
    expect(() => new FigmaAPI(graph).setVariableValue(opaque.id, mode, 9)).toThrow(
      'unsupported variable expression'
    )
    const unused = graph.createCollection('Unused')
    editor.removeCollection(unused.id)
    expect(graph.variableCollections.has(unused.id)).toBe(false)
    const added = graph.createVariable('New', 'FLOAT', collection.id)
    editor.addVariable(added)
    editor.undoAction()
    expect(graph.variables.has(added.id)).toBe(false)
    editor.redoAction()
    editor.removeVariable(added.id)
    const newCollection = graph.createCollection('New')
    editor.addMode(newCollection.id, 'Other')
    editor.undoAction()
    expect(newCollection.modes).toHaveLength(1)
    editor.addCollection(newCollection)
    editor.undoAction()
    expect(graph.variableCollections.has(newCollection.id)).toBe(false)
    editor.redoAction()
    editor.removeCollection(newCollection.id)
    editor.updateVariableValue(literal.id, mode, 42)
    editor.renameCollection(collection.id, 'Safe edit')
    const full = deserializeSceneGraph(structuredClone(serializeSceneGraph(graph)))
    expect(full.variables.get(opaque.id)?.valuesByMode[mode]).toEqual(
      graph.variables.get(opaque.id)?.valuesByMode[mode]
    )
    const fresh = full.createVariable('New after recovery', 'FLOAT', collection.id)
    full.removeVariable(fresh.id)
    expect(full.variables.has(fresh.id)).toBe(false)
    for (const saved of [await exportFigFile(graph), await exportFigFile(full)]) {
      const reopened = await parseFigFile(saved.slice().buffer)
      expect(reopened.variables.get(opaque.id)?.valuesByMode[mode]).toMatchObject({
        expression: 'UNSUPPORTED',
        value: entry.variableData,
        references: [literal.id]
      })
      expect(reopened.resolveVariable(literal.id)).toBe(42)
      expect(reopened.getPages().map((page) => reopened.getChildren(page.id)[0].width)).toEqual([
        91, 91
      ])
    }
  } finally {
    releaseFigPopulationWorker(graph)
  }
})
