import 'fake-indexeddb/auto'
import { expect, spyOn, test } from 'bun:test'

import { FigmaAPI } from '@open-pencil/core/figma-api'
import { ALL_TOOLS } from '@open-pencil/core/tools'

import { executeAtomicEditorTool } from '@/app/automation/execution/editor'
import * as fonts from '@/app/editor/fonts'
import { createEditorStore } from '@/app/editor/session/create'

for (const loaded of [false, true]) {
  test(`bulk font completion prepares all changed text together; newly loaded=${loaded}`, async () => {
    const store = createEditorStore()
    const page = store.state.currentPageId
    const secondPage = store.graph.addPage('Other').id
    const a = store.graph.createNode('TEXT', page, { text: 'A' })
    const b = store.graph.createNode('TEXT', secondPage, { text: 'B' })
    const prepare = spyOn(fonts, 'ensureGraphFonts').mockResolvedValue(loaded)
    const layout = spyOn(store, 'runLayoutForNode')
    try {
      const tool = ALL_TOOLS.find((tool) => tool.name === 'set_font')
      if (!tool) throw new Error('Missing font tool')
      await executeAtomicEditorTool(store, new FigmaAPI(store.graph), tool, {
        ids: [a.id, b.id],
        family: 'Inter',
        size: 24
      })
      expect(prepare).toHaveBeenCalledTimes(1)
      expect(prepare.mock.calls[0]?.[1].toSorted()).toEqual([a.id, b.id].toSorted())
      expect(layout).toHaveBeenCalledTimes(loaded ? 4 : 2)
      expect(a.fontSize).toBe(24)
      expect(b.fontSize).toBe(24)
    } finally {
      prepare.mockRestore()
      layout.mockRestore()
      store.dispose()
    }
  })
}
