import { expect, spyOn, test } from 'bun:test'

import * as JSONSchema from '@valibot/to-json-schema'

import { createEditor, executeAtomicTool } from '@open-pencil/core/editor'

import { FigmaAPI } from '#core/figma-api'
import { setOpacity } from '#core/tools/modify/geometry'
import { setFont, setText } from '#core/tools/modify/text'

test('one shared font edit updates 100 targets with one layout settlement and undo', () => {
  const editor = createEditor()
  const figma = new FigmaAPI(editor.graph)
  const texts = Array.from({ length: 100 }, () => figma.createText())
  editor.undo.clear()
  const layout = spyOn(editor, 'runLayoutForNode')
  try {
    const result = executeAtomicTool(editor, figma, setFont, {
      ids: texts.map((node) => node.id),
      family: 'Inter',
      style: 'Bold',
      size: 24
    })
    expect(result).toMatchObject({ updated: 100 })
    expect(layout).toHaveBeenCalledTimes(1)
    for (const node of texts) {
      expect(node.fontSize).toBe(24)
      expect(node.fontName).toEqual({ family: 'Inter', style: 'Bold' })
    }
    editor.undo.undo()
    for (const node of texts) expect(node.fontSize).toBe(12)
    expect(editor.undo.canUndo).toBe(false)
    editor.undo.redo()
    for (const node of texts) expect(node.fontSize).toBe(24)
  } finally {
    layout.mockRestore()
    editor.dispose()
  }
})

test('per-item text differs, duplicate shared IDs are deduplicated, and legacy output stays intact', () => {
  const editor = createEditor()
  const figma = new FigmaAPI(editor.graph)
  const a = figma.createText(),
    b = figma.createText()
  try {
    expect(
      setText.execute(figma, {
        items: [
          { id: a.id, text: 'First' },
          { id: b.id, text: 'Second' }
        ]
      })
    ).toMatchObject({ updated: 2 })
    expect([a.characters, b.characters]).toEqual(['First', 'Second'])
    expect(setOpacity.execute(figma, { ids: [a.id, a.id, b.id], value: 0.5 })).toMatchObject({
      updated: 2
    })
    expect(setOpacity.execute(figma, { id: a.id, value: 1 })).toEqual({ id: a.id, opacity: 1 })
    expect(() => setOpacity.execute(figma, { id: a.id, ids: [b.id], value: 0.5 })).toThrow()
    expect(() =>
      setText.execute(figma, { items: [{ id: a.id, text: 'No' }], text: 'Ambiguous' })
    ).toThrow()
  } finally {
    editor.dispose()
  }
})

test('a wrong-type font target rolls the batch back and creates no undo entry', () => {
  const editor = createEditor()
  const figma = new FigmaAPI(editor.graph)
  const text = figma.createText(),
    frame = figma.createFrame()
  editor.undo.clear()
  try {
    expect(() =>
      executeAtomicTool(editor, figma, setFont, { ids: [text.id, frame.id], size: 30 })
    ).toThrow('not a TEXT node')
    expect(text.fontSize).toBe(12)
    expect(editor.undo.canUndo).toBe(false)
  } finally {
    editor.dispose()
  }
})

test('the exposed JSON schema advertises native arrays and rejects oversized batches', () => {
  const json = JSONSchema.toJsonSchema(setFont.input, { errorMode: 'ignore' })
  expect(json.properties?.ids).toMatchObject({ type: 'array', maxItems: 200 })
  expect(json.properties?.items).toMatchObject({ type: 'array' })
  const editor = createEditor()
  try {
    expect(() =>
      setOpacity.execute(new FigmaAPI(editor.graph), {
        ids: Array.from({ length: 201 }, () => 'a'),
        value: 1
      })
    ).toThrow('Invalid arguments')
  } finally {
    editor.dispose()
  }
})
