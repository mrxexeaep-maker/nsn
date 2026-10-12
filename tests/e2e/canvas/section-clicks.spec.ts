import { expect, test, type Page } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'

// Each case repeats a click in Figma desktop 126 on a section holding two frames.

async function setup(page: Page) {
  await page.goto('/?test')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()
  await page.evaluate(() => {
    const editor = window.openPencil?.getStore?.()
    if (!editor) throw new Error('Editor unavailable')
    const { graph } = editor
    const page = editor.state.currentPageId
    const white = [
      { type: 'SOLID' as const, color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true }
    ]
    const section = graph.createNode('SECTION', page, {
      name: 'Section',
      width: 800,
      height: 500,
      fills: white
    })
    graph.createNode('FRAME', section.id, {
      name: 'Empty',
      x: 50,
      y: 80,
      width: 200,
      height: 150,
      fills: white
    })
    const full = graph.createNode('FRAME', section.id, {
      name: 'Full',
      x: 300,
      y: 80,
      width: 200,
      height: 150,
      fills: white
    })
    graph.createNode('RECTANGLE', full.id, { name: 'Child', x: 10, y: 10, width: 40, height: 40 })
    editor.state.zoom = 1
    editor.state.panX = 50
    editor.state.panY = 50
    editor.select([])
    editor.requestRender()
  })
  return canvas
}

const selection = (page: Page) =>
  page.evaluate(() => {
    const editor = window.openPencil?.getStore?.()
    return [...(editor?.state.selectedIds ?? [])].map((id) => editor?.graph.getNode(id)?.name)
  })

const canvasPoint = async (page: Page, x: number, y: number) => {
  const box = await page.getByTestId('canvas-element').boundingBox()
  if (!box) throw new Error('Canvas has no bounding box')
  return { x: box.x + 50 + x, y: box.y + 50 + y }
}

test('a click on a section’s empty area selects it, a drag there marquee-selects inside it', async ({
  page
}) => {
  const canvas = await setup(page)
  await canvas.click(750, 450)
  await expect.poll(() => selection(page)).toEqual(['Section'])
  await page.evaluate(() => window.openPencil?.getStore?.().select([]))
  await canvas.drag(80, 100, 550, 300)
  await expect.poll(() => selection(page)).toEqual(['Empty', 'Full'])
})

test('a right-click selects the frame or section whose empty area is under it', async ({
  page
}) => {
  await setup(page)
  for (const [x, y, name] of [
    [450, 180, 'Full'],
    [150, 155, 'Empty'],
    [700, 400, 'Section']
  ] as const) {
    await page.evaluate(() => window.openPencil?.getStore?.().select([]))
    const point = await canvasPoint(page, x, y)
    await page.mouse.click(point.x, point.y, { button: 'right' })
    await expect.poll(() => selection(page)).toEqual([name])
    await page.keyboard.press('Escape')
  }
})
