import { expect, test, useEditorSetup } from '#tests/e2e/fixtures'
import { toolbarToolTestId } from '#tests/helpers/test-ids'

const editor = useEditorSetup()

interface StickyState {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  fill: string
  body: { text: string; fontSize: number }
  author: { text: string; visible: boolean }
  selected: string[]
  editing: string | null
}

/** The page's last sticky note, with its sublayers and the editor's selection and text edit. */
function lastSticky(): Promise<StickyState | null> {
  return editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const sticky = store.graph
      .getChildren(store.state.currentPageId)
      .findLast((node) => node.type === 'STICKY')
    if (!sticky) return null
    const [body, author] = store.graph.getChildren(sticky.id)
    const color = sticky.fills[0]?.color
    const hex = (value = 0) =>
      Math.round(value * 255)
        .toString(16)
        .padStart(2, '0')
    return {
      id: sticky.id,
      name: sticky.name,
      x: sticky.x,
      y: sticky.y,
      width: sticky.width,
      height: sticky.height,
      fill: `#${hex(color?.r)}${hex(color?.g)}${hex(color?.b)}`,
      body: { text: body.text, fontSize: body.fontSize },
      author: { text: author.text, visible: author.visible },
      selected: [...store.state.selectedIds],
      editing: store.state.editingTextId
    }
  })
}

/** A canvas point at the middle of the node, from the editor's pan and zoom. */
function screenCenter(note: StickyState) {
  return editor.page.evaluate(({ x, y, width, height }) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const { panX, panY, zoom } = store.state
    return { x: (x + width / 2) * zoom + panX, y: (y + height / 2) * zoom + panY }
  }, note)
}

/** Picks the sticky tool, which has no key: Figma's S is Slice. */
async function pickStickyTool() {
  await editor.page.evaluate(() => window.openPencil?.getStore?.().setTool('STICKY'))
}

test('the toolbar hides the sticky tool until it is shown, and S does not pick it', async () => {
  await expect(editor.page.getByTestId(toolbarToolTestId('STICKY'))).toHaveCount(0)
  await editor.page.keyboard.press('s')
  const tool = await editor.page.evaluate(() => window.openPencil?.getStore?.().state.activeTool)
  expect(tool).toBe('SELECT')
})

test('the sticky tool places a note to type into where the pointer is released', async () => {
  await pickStickyTool()

  await editor.canvas.click(400, 300)
  await editor.canvas.waitForRender()
  const placed = await lastSticky()
  expect(placed).toMatchObject({ width: 240, height: 240, fill: '#a8daff', body: { text: '' } })
  if (!placed) throw new Error('Missing sticky note')
  expect(placed.selected).toEqual([placed.id])
  expect(placed.editing).not.toBeNull()
  const center = await screenCenter(placed)
  expect(center.x).toBeCloseTo(400, 0)
  expect(center.y).toBeCloseTo(300, 0)

  await editor.page.keyboard.type('Hello sticky')
  await editor.page.keyboard.press('Escape')
  await editor.canvas.waitForRender()
  const typed = await lastSticky()
  expect(typed).toMatchObject({
    name: 'Hello sticky',
    body: { text: 'Hello sticky' },
    editing: null
  })
  expect(typed?.selected).toEqual([typed?.id])
  const tool2 = await editor.page.evaluate(() => window.openPencil?.getStore?.().state.activeTool)
  expect(tool2).toBe('SELECT')
})

test('the Sticky note section recolours the note, sizes its text, and hides its author', async () => {
  const section = editor.page.getByRole('region', { name: 'Sticky note' })
  await expect(section).toBeVisible()

  await section.getByRole('radio', { name: 'Yellow' }).click()
  await expect.poll(async () => (await lastSticky())?.fill).toBe('#ffe299')

  await section.getByRole('combobox', { name: 'Text size' }).click()
  await editor.page.getByRole('option', { name: 'Large', exact: true }).click()
  await expect.poll(async () => (await lastSticky())?.body.fontSize).toBe(40)

  await section.getByRole('switch', { name: 'Show author' }).click()
  await expect.poll(async () => (await lastSticky())?.author.visible).toBe(false)
})

test('the next note takes the colour picked last', async () => {
  await editor.page.keyboard.press('Escape')
  await pickStickyTool()
  await editor.canvas.click(150, 150)
  await editor.canvas.waitForRender()
  expect((await lastSticky())?.fill).toBe('#ffe299')
  await editor.page.keyboard.press('Escape')
})

test('double-clicking a note edits its body with all of it selected', async () => {
  const note = await lastSticky()
  if (!note) throw new Error('Missing sticky note')
  await editor.page.keyboard.press('Escape')
  const center = await screenCenter(note)
  await editor.canvas.dblclick(center.x, center.y)
  await editor.canvas.waitForRender()
  expect((await lastSticky())?.editing).not.toBeNull()
  await editor.page.keyboard.type('Replaced')
  await editor.page.keyboard.press('Escape')
  await editor.canvas.waitForRender()
  const edited = await lastSticky()
  expect(edited).toMatchObject({ body: { text: 'Replaced' }, name: 'Replaced' })
  expect(edited?.selected).toEqual([edited?.id])
})

test("dragging a note's right side makes it wide, and back square, as in FigJam", async () => {
  await editor.page.keyboard.press('Escape')
  const note = await lastSticky()
  if (!note) throw new Error('Missing sticky note')
  await editor.canvas.click((await screenCenter(note)).x, (await screenCenter(note)).y)
  const edge = await editor.page.evaluate(({ x, y, width, height }) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const { panX, panY, zoom } = store.state
    return { x: (x + width) * zoom + panX, y: (y + height / 2) * zoom + panY }
  }, note)
  await editor.canvas.drag(edge.x, edge.y, edge.x + 150, edge.y)
  await expect.poll(async () => (await lastSticky())?.width).toBe(416)
  await editor.canvas.drag(edge.x + 176, edge.y, edge.x - 20, edge.y)
  await expect.poll(async () => (await lastSticky())?.width).toBe(240)
})
