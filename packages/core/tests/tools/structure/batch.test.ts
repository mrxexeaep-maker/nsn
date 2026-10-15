import { expect, test } from 'bun:test'

import { createEditor, executeAtomicTool } from '@open-pencil/core/editor'
import { SceneGraph } from '@open-pencil/scene-graph'

import { FigmaAPI } from '#core/figma-api'
import { batchUpdate } from '#core/tools/structure/batch'

test('native and legacy content batches preserve nodes and reject partial changes', () => {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const first = graph.createNode('TEXT', page.id, { text: 'Sample' })
  const second = graph.createNode('TEXT', page.id, { text: 'Sample' })
  const figma = new FigmaAPI(graph)
  const operations = [
    { id: first.id, props: { text: 'Local recording', font_size: 24 } },
    { id: second.id, props: { text: 'Stored on your NAS', font_family: 'Inter' } }
  ]
  expect(batchUpdate.execute(figma, { operations })).toMatchObject({ updated: 2 })
  expect([first.text, second.text]).toEqual(['Local recording', 'Stored on your NAS'])
  expect(first.fontSize).toBe(24)
  expect(batchUpdate.execute(figma, { operations: JSON.stringify(operations) })).toMatchObject({
    updated: 2
  })
  expect(() =>
    batchUpdate.execute(figma, {
      operations: [
        { id: first.id, props: { text: 'Must roll back' } },
        { id: 'missing', props: { text: 'Missing' } }
      ]
    })
  ).toThrow('no batch changes were kept')
  expect(first.text).toBe('Local recording')
})

test('invalid properties and values fail validation before any edits', () => {
  const figma = new FigmaAPI(new SceneGraph())
  const text = figma.createText()
  for (const props of [{ font_szie: 30 }, { opacity: 'nonsense' }, { visible: 'false' }]) {
    expect(() =>
      batchUpdate.execute(figma, {
        operations: [
          { id: text.id, props: { opacity: 0.4 } },
          { id: text.id, props }
        ]
      })
    ).toThrow('Invalid arguments')
    expect(text.opacity).toBe(1)
  }
  expect(() => batchUpdate.execute(figma, { operations: '[null]' })).toThrow('Invalid arguments')
})

test('mixed property edits share one undo operation and recover from a runtime failure', () => {
  const editor = createEditor()
  const figma = new FigmaAPI(editor.graph)
  const a = figma.createText()
  const b = figma.createText()
  editor.undo.clear()
  try {
    executeAtomicTool(editor, figma, batchUpdate, {
      operations: [
        { id: a.id, props: { text: 'A', font_size: 20 } },
        { id: b.id, props: { text: 'B', opacity: 0.5 } }
      ]
    })
    expect(a.characters).toBe('A')
    expect(b.characters).toBe('B')
    editor.undo.undo()
    expect(a.characters).toBe('')
    expect(b.characters).toBe('')
    expect(b.opacity).toBe(1)
    expect(editor.undo.canUndo).toBe(false)
    editor.undo.redo()
    expect(a.fontSize).toBe(20)
    expect(b.opacity).toBe(0.5)
  } finally {
    editor.dispose()
  }
})
