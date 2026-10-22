import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, test } from 'bun:test'

import { ALL_TOOLS } from '@open-pencil/core/tools'
import { SceneGraph } from '@open-pencil/scene-graph'

import { runEditorTool } from '@/app/ai/tools/runner'
import { makeFigmaFromStore } from '@/app/automation/bridge/figma-factory'
import { createEditorStore, type EditorStore } from '@/app/editor/session/create'

import { expectDefined } from '#tests/helpers/assert'

let store: EditorStore

beforeEach(() => {
  // The automation FigmaAPI reads the viewport size from the window.
  Object.assign(globalThis, { window: { innerWidth: 1024, innerHeight: 768 } })
  store = createEditorStore(new SceneGraph())
})

afterEach(() => {
  store.dispose()
  Reflect.deleteProperty(globalThis, 'window')
})

test('a call cancelled before its turn edits nothing', async () => {
  const def = expectDefined(
    ALL_TOOLS.find((tool) => tool.name === 'create_shape'),
    'create_shape'
  )
  const pageId = store.state.currentPageId
  const signal = AbortSignal.abort()
  const call = runEditorTool({
    store,
    figma: makeFigmaFromStore(store, pageId),
    def,
    args: { type: 'RECTANGLE', x: 0, y: 0, width: 40, height: 20 },
    source: 'WebMCP',
    signal
  })
  await expect(call).rejects.toThrow()
  expect(store.graph.getChildren(pageId)).toEqual([])
  expect(store.undo.peekUndo()).toBeUndefined()
})
