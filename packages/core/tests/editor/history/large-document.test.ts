import { expect, test } from 'bun:test'

import { createEditor, executeAtomicTool } from '@open-pencil/core/editor'
import { FigmaAPI } from '@open-pencil/core/figma-api'
import { ALL_TOOLS, type ToolDef } from '@open-pencil/core/tools'

function tool(name: string): ToolDef {
  const def = ALL_TOOLS.find((entry) => entry.name === name)
  if (!def) throw new Error(`Missing tool ${name}`)
  return def
}

test('large documents support linked text edits, layout, undo/redo and failed-edit rollback', async () => {
  const editor = createEditor()
  const { graph } = editor
  const figma = new FigmaAPI(graph)
  const component = figma.createComponent()
  component.layoutMode = 'VERTICAL'
  component.primaryAxisSizingMode = 'AUTO'
  component.counterAxisSizingMode = 'FIXED'
  const text = figma.createText()
  component.appendChild(text)
  text.characters = 'Original'
  text.resize(120, 24)
  text.textAutoResize = 'NONE'
  const instance = component.createInstance()
  await Promise.resolve()
  const archivePage = graph.addPage('Large library')
  for (let i = 0; i < 10_010; i++) graph.createNode('RECTANGLE', archivePage.id)
  const unrelated = graph.getChildren(archivePage.id)[0]
  const source = unrelated.source
  const contents = instance.children[0]
  executeAtomicTool(editor, figma, tool('set_text'), { id: text.id, text: 'Changed content' })
  await Promise.resolve()
  expect(contents.characters).toBe('Changed content')
  editor.undo.undo()
  await Promise.resolve()
  expect(text.characters).toBe('Original')
  expect(contents.characters).toBe('Original')
  editor.undo.redo()
  await Promise.resolve()
  expect(contents.characters).toBe('Changed content')

  const before = component.height
  executeAtomicTool(editor, figma, tool('update_node'), { id: text.id, height: 80 })
  await Promise.resolve()
  expect(component.height).toBe(80)
  expect(instance.height).toBe(80)
  editor.undo.undo()
  await Promise.resolve()
  expect(component.height).toBe(before)
  expect(instance.height).toBe(before)

  const failing: ToolDef = {
    ...tool('set_text'),
    execute: (api, args) => {
      tool('set_text').execute(api, args)
      throw new Error('Failed after text edit')
    }
  }
  expect(() =>
    executeAtomicTool(editor, figma, failing, {
      id: text.id,
      text: 'Must roll back'
    })
  ).toThrow('Failed after text edit')
  await Promise.resolve()
  expect(text.characters).toBe('Changed content')
  expect(contents.characters).toBe('Changed content')
  expect(unrelated.source).toBe(source)
  expect(graph.getChildren(archivePage.id)).toHaveLength(10_010)
  editor.dispose()
})

test('layout failures restore secondary writes on another page without creating undo', () => {
  const editor = createEditor()
  const figma = new FigmaAPI(editor.graph)
  const text = figma.createText()
  text.characters = 'Before'
  const page = editor.graph.addPage('Other')
  const frame = editor.graph.createNode('FRAME', page.id, { width: 100 })
  const mutationEditor = {
    graph: editor.graph,
    requestRender: editor.requestRender,
    pushUndoStep: editor.pushUndoStep,
    runLayoutForNode: () => {
      editor.graph.updateNode(frame.id, { width: 300 })
      throw new Error('Layout failed')
    }
  }
  expect(() =>
    executeAtomicTool(mutationEditor, figma, tool('set_text'), {
      id: text.id,
      text: 'After'
    })
  ).toThrow('Layout failed')
  expect(text.characters).toBe('Before')
  expect(frame.width).toBe(100)
  expect(editor.undo.canUndo).toBe(false)
  editor.dispose()
})
