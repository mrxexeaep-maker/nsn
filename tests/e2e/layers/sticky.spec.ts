import { expect, test, type Page } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'

/** A frame with enough children to scroll past its own row, expanded in the layers panel. */
async function scrolledFrame(page: Page) {
  await page.goto('/')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()
  canvas.errors.length = 0
  await canvas.clearCanvas()

  const frameId = await page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const frame = store.graph.createNode('FRAME', store.state.currentPageId, {
      name: 'Pinned frame',
      width: 400,
      height: 400
    })
    const children = Array.from(
      { length: 60 },
      (_, i) =>
        store.graph.createNode('RECTANGLE', frame.id, { name: `Child ${i + 1}`, x: i, y: i }).id
    )
    // Selecting a child expands the frame in the layers panel.
    store.select([children[0]])
    store.requestRender()
    return frame.id
  })
  await canvas.waitForRender()

  await page.getByTestId('layers-scroll').evaluate((el) => {
    el.scrollTop = 600
  })
  const pinned = page.getByTestId('layers-sticky-row')
  await expect(pinned).toContainText('Pinned frame')
  return { canvas, frameId, pinned }
}

test('right-clicking the pinned frame row opens the layer menu for it', async ({ page }) => {
  const { canvas, frameId, pinned } = await scrolledFrame(page)

  await pinned.click({ button: 'right' })
  await expect(page.getByRole('menu')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => [...(window.openPencil?.getStore?.()?.state.selectedIds ?? [])])
    )
    .toEqual([frameId])
  canvas.assertNoErrors()
})

test('double-clicking the pinned frame row renames it on its own row', async ({ page }) => {
  const { canvas, pinned } = await scrolledFrame(page)

  await pinned.dblclick()
  const input = page.getByTestId('layers-item-input')
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('Pinned frame')
  // The list scrolled back to the frame's row, so nothing is pinned while it is renamed.
  await expect(pinned).toHaveCount(0)
  canvas.assertNoErrors()
})
