import { expect, test } from 'bun:test'

import { createEditor, executeAtomicTool } from '@open-pencil/core/editor'

import { FigmaAPI } from '#core/figma-api'
import { bindVariable } from '#core/tools/variables/bindings'
import { createCollection, deleteCollection } from '#core/tools/variables/collections'
import { unbindVariable } from '#core/tools/variables/unbind'
import { createVariable, setVariable } from '#core/tools/variables/values'

test('create typed tokens together and roll back invalid creation without orphan collection entries', () => {
  const editor = createEditor()
  const figma = new FigmaAPI(editor.graph)
  try {
    expect(
      createCollection.execute(figma, { items: [{ name: 'Colors' }, { name: 'Spacing' }] })
    ).toMatchObject({ updated: 2 })
    const collection = figma.getLocalVariableCollections()[0]
    const result = createVariable.execute(figma, {
      items: [
        { collection_id: collection.id, name: 'space/md', type: 'FLOAT', value: 16 },
        { collection_id: collection.id, name: 'enabled', type: 'BOOLEAN', value: false },
        { collection_id: collection.id, name: 'text', type: 'STRING', value: 'Settings' },
        { collection_id: collection.id, name: 'surface', type: 'COLOR', value: '#ffffff' }
      ]
    })
    const variables = figma.getLocalVariables()
    expect(result).toMatchObject({
      updated: 4,
      results: variables.map((variable, index) => ({ index, id: variable.id }))
    })
    expect(variables.map((variable) => variable.valuesByMode[collection.defaultModeId])).toEqual([
      16,
      false,
      'Settings',
      { r: 1, g: 1, b: 1, a: 1 }
    ])
    expect(() =>
      createVariable.execute(figma, {
        items: [
          { collection_id: collection.id, name: 'First', type: 'FLOAT', value: 4 },
          { collection_id: collection.id, name: 'Invalid', type: 'FLOAT', value: 'not a number' }
        ]
      })
    ).toThrow('no batch changes were kept')
    expect(figma.getLocalVariables()).toHaveLength(4)
    expect(collection.variableIds).toHaveLength(4)
    expect(() =>
      createVariable.execute(figma, {
        items: [
          { collection_id: collection.id, name: 'Valid', type: 'COLOR', value: '#123456' },
          { collection_id: collection.id, name: 'Invalid', type: 'COLOR', value: 'not a color' }
        ]
      })
    ).toThrow('Invalid color')
    expect(figma.getLocalVariables()).toHaveLength(4)
    expect(() => deleteCollection.execute(figma, { ids: [collection.id, 'missing'] })).toThrow()
    expect(figma.getLocalVariableCollections()).toHaveLength(2)
    expect(figma.getLocalVariables()).toHaveLength(4)
  } finally {
    editor.dispose()
  }
})

test('variable value batches validate modes and Boolean types, and undo together', () => {
  const editor = createEditor()
  const figma = new FigmaAPI(editor.graph)
  const collection = figma.createVariableCollection('Tokens')
  const a = figma.createVariable('a', 'FLOAT', collection.id, 4)
  const b = figma.createVariable('b', 'BOOLEAN', collection.id, false)
  const mode = collection.defaultModeId
  editor.undo.clear()
  try {
    executeAtomicTool(editor, figma, setVariable, {
      items: [
        { id: a.id, mode, value: '8' },
        { id: b.id, mode, value: true }
      ]
    })
    expect([a.valuesByMode[mode], b.valuesByMode[mode]]).toEqual([8, true])
    editor.undo.undo()
    expect([a.valuesByMode[mode], b.valuesByMode[mode]]).toEqual([4, false])
    editor.undo.redo()
    expect([a.valuesByMode[mode], b.valuesByMode[mode]]).toEqual([8, true])
    for (const invalid of [
      { id: b.id, mode, value: 'yes' },
      { id: a.id, mode: 'missing', value: 12 }
    ]) {
      expect(() =>
        setVariable.execute(figma, { items: [{ id: a.id, mode, value: 20 }, invalid] })
      ).toThrow()
      expect(a.valuesByMode[mode]).toBe(8)
      expect(Object.keys(a.valuesByMode)).toEqual([mode])
    }
  } finally {
    editor.dispose()
  }
})

test('bind and unbind a shared variable across nodes with undo and failed-batch recovery', () => {
  const editor = createEditor()
  const figma = new FigmaAPI(editor.graph)
  const collection = figma.createVariableCollection('Tokens')
  const variable = figma.createVariable('visible', 'BOOLEAN', collection.id, false)
  const nodes = [figma.createFrame(), figma.createFrame()]
  const ids = nodes.map((node) => node.id)
  try {
    executeAtomicTool(editor, figma, bindVariable, {
      ids,
      field: 'visible',
      variable_id: variable.id
    })
    for (const id of ids) expect(figma.graph.getNode(id)?.boundVariables.visible).toBe(variable.id)
    editor.undo.undo()
    for (const id of ids) expect(figma.graph.getNode(id)?.boundVariables.visible).toBeUndefined()
    editor.undo.redo()
    expect(() =>
      unbindVariable.execute(figma, { ids: [ids[0], 'missing'], field: 'visible' })
    ).toThrow()
    for (const id of ids) expect(figma.graph.getNode(id)?.boundVariables.visible).toBe(variable.id)
    executeAtomicTool(editor, figma, unbindVariable, { ids, field: 'visible' })
    for (const id of ids) expect(figma.graph.getNode(id)?.boundVariables.visible).toBeUndefined()
  } finally {
    editor.dispose()
  }
})
