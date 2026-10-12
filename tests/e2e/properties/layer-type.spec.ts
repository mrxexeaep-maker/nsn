import { expect, test } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'

test('the layer type menu turns a frame into a group and back', async ({ page }) => {
  await page.goto('/?test')
  await new CanvasHelper(page).waitForInit()
  const id = await page.evaluate(() => {
    const editor = window.openPencil?.getStore?.()
    if (!editor) throw new Error('Editor unavailable')
    const frame = editor.createShape('FRAME', 100, 100, 200, 150)
    editor.createShape('RECTANGLE', 20, 20, 40, 40, frame)
    editor.select([frame])
    return frame
  })
  const type = () =>
    page.evaluate((id) => window.openPencil?.getStore?.().graph.getNode(id)?.type, id)
  await page.getByTestId('layer-type-trigger').click()
  await page.getByTestId('layer-type-group').click()
  await expect.poll(type).toBe('GROUP')
  await page.getByTestId('layer-type-trigger').click()
  await page.getByTestId('layer-type-frame').click()
  await expect.poll(type).toBe('FRAME')
})
