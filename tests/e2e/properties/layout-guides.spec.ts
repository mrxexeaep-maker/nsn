import { expect, test, type Page } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'

// Each case repeats a selection made in Figma desktop 126.

const COLUMNS = {
  pattern: 'COLUMNS' as const,
  count: 5,
  gutterSize: 20,
  offset: 0,
  visible: true,
  color: { r: 1, g: 0, b: 0, a: 0.1 }
}

/** Frames with the given guides, and a rectangle, all selected as `select` picks them. */
async function setup(page: Page, guides: (typeof COLUMNS)[][]) {
  await page.goto('/?test')
  await new CanvasHelper(page).waitForInit()
  return page.evaluate((guides) => {
    const editor = window.openPencil?.getStore?.()
    if (!editor) throw new Error('Editor unavailable')
    const frames = guides.map((layoutGrids, index) => {
      const id = editor.createShape('FRAME', 100 + index * 260, 100, 200, 150)
      editor.updateNode(id, { layoutGrids })
      return id
    })
    const rect = editor.createShape('RECTANGLE', 100, 400, 100, 100)
    return { frames, rect }
  }, guides)
}

const select = (page: Page, ids: string[]) =>
  page.evaluate((ids) => window.openPencil?.getStore?.().select(ids), ids)

const guidesOf = (page: Page, ids: string[]) =>
  page.evaluate(
    (ids) =>
      ids.map((id) =>
        window.openPencil
          ?.getStore?.()
          .graph.getNode(id)
          ?.layoutGrids.map((grid) =>
            `${grid.pattern} ${grid.count ?? ''} ${grid.sectionSize ?? ''}`.trim()
          )
      ),
    ids
  )

const heading = (page: Page) => page.getByRole('heading', { name: 'Layout guide', exact: true })

test('frames with the same guides list them, and an edit changes every frame in one Undo', async ({
  page
}) => {
  const { frames } = await setup(page, [[COLUMNS], [COLUMNS]])
  await select(page, frames)
  const count = page.getByRole('spinbutton', { name: 'Count', exact: true })
  await expect(count).toBeVisible()
  await count.dblclick()
  await count.fill('8')
  await count.press('Enter')
  await expect.poll(() => guidesOf(page, frames)).toEqual([['COLUMNS 8'], ['COLUMNS 8']])
  await heading(page).click()
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => guidesOf(page, frames)).toEqual([['COLUMNS 5'], ['COLUMNS 5']])
})

test('frames with different guides show none, and Add gives each one 10 px grid', async ({
  page
}) => {
  const { frames } = await setup(page, [[COLUMNS], []])
  await select(page, frames)
  await expect(heading(page)).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Count', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add layout guide' }).click()
  await expect.poll(() => guidesOf(page, frames)).toEqual([['GRID 5 10'], ['GRID 5 10']])
})

test('a selection with a layer that is not a frame has no layout guides', async ({ page }) => {
  const { frames, rect } = await setup(page, [[COLUMNS]])
  await select(page, [frames[0], rect])
  await expect(page.getByRole('heading', { name: 'Fill', exact: true })).toBeVisible()
  await expect(heading(page)).toHaveCount(0)
})
