import { expect, test } from 'bun:test'

import { createEditor } from '@open-pencil/core/editor'
import { SceneGraph } from '@open-pencil/scene-graph'

/** A collection the file copies from a library, with one of its variables. */
function libraryCollection() {
  const graph = new SceneGraph()
  const collection = graph.createCollection('Tokens')
  collection.key = 'bf3948d3'
  const brand = graph.createVariable('Color/Brand', 'FLOAT', collection.id, 4)
  graph.createVariable('Color/Accent', 'FLOAT', collection.id, 2)
  graph.createMode(collection.id, 'Dark')
  return { editor: createEditor({ graph }), graph, collection, brand }
}

test("a library's collection is read, not changed, as Figma keeps it", () => {
  const { editor, graph, collection, brand } = libraryCollection()
  const before = structuredClone({
    collection: graph.variableCollections.get(collection.id),
    variables: [...graph.variables.values()]
  })

  editor.addVariable({
    id: 'var:added',
    name: 'Added',
    type: 'FLOAT',
    collectionId: collection.id,
    valuesByMode: { [collection.defaultModeId]: 0 },
    description: '',
    hiddenFromPublishing: false
  })
  editor.renameCollection(collection.id, 'Renamed')
  editor.renameVariable(brand.id, 'Renamed')
  editor.updateVariableValue(brand.id, collection.defaultModeId, 8)
  expect(editor.addMode(collection.id, 'Dark')).toBeUndefined()
  expect(editor.duplicateVariable(brand.id, 'Copy')).toBeUndefined()
  const [light, dark] = collection.modes.map((mode) => mode.modeId)
  editor.renameMode(collection.id, dark, 'Night')
  editor.setDefaultMode(collection.id, dark)
  expect(editor.duplicateMode(collection.id, light)).toBeUndefined()
  editor.setModeCondition(collection.id, dark, '(prefers-color-scheme: dark)')
  editor.setModeAttribute(collection.id, 'data-theme')
  editor.setVariableOrder(collection.id, [...graph.variables.keys()].reverse())
  editor.updateVariableToken(brand.id, { description: 'Changed' })
  editor.removeMode(collection.id, dark)
  editor.removeVariable(brand.id)
  editor.removeCollection(collection.id)

  expect({
    collection: graph.variableCollections.get(collection.id),
    variables: [...graph.variables.values()]
  }).toEqual(before)
  expect(graph.variables.has('var:added')).toBe(false)
})

test("the file's own collections stay editable", () => {
  const { editor, graph } = libraryCollection()
  const own = graph.createCollection('Spacing')
  const gap = graph.createVariable('Gap', 'FLOAT', own.id, 4)

  editor.updateVariableValue(gap.id, own.defaultModeId, 8)
  expect(graph.variables.get(gap.id)?.valuesByMode[own.defaultModeId]).toBe(8)
})
