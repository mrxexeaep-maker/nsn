import { expect, test, useEditorSetupWithClear } from '#tests/e2e/fixtures'

const editor = useEditorSetupWithClear('/?test&no-chrome&no-rulers')

test('sticky notes draw their colour, shadows, body, author, and the empty placeholder', async () => {
  await editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const pageId = store.state.currentPageId
    const write = (id: string, text: string) => {
      const [body] = store.graph.getChildren(id)
      store.graph.updateNode(body.id, { text })
      store.runLayoutForNode(id)
    }
    const empty = store.createStickyNote(pageId, { x: 160, y: 160 })
    const typed = store.createStickyNote(pageId, { x: 440, y: 160 })
    write(typed.id, 'Ship sticky notes\nwith connectors next')
    const yellow = store.createStickyNote(pageId, { x: 720, y: 160 })
    write(yellow.id, 'No author here')
    store.setStickyColor([yellow.id], { r: 1, g: 226 / 255, b: 153 / 255, a: 1 })
    store.setStickyAuthorVisible([yellow.id], false)
    for (const note of [empty, typed]) {
      const [, author] = store.graph.getChildren(note.id)
      store.graph.updateNode(author.id, { text: 'Ada Lovelace' })
    }
    store.clearSelection()
  })
  await editor.canvas.waitForRender()
  editor.canvas.assertNoErrors()
  expect(await editor.canvas.screenshotCanvasRegion()).toMatchSnapshot('sticky-notes.png')
})
