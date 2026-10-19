import { expect, test, useEditorSetupWithClear } from '#tests/e2e/fixtures'

const editor = useEditorSetupWithClear('/?test&no-chrome&no-rulers')

// The ring, corner radii, and dashes are checked against Figma in packages/core/tests/canvas/strokes.test.ts.
test('strokes with sides of their own weights', async () => {
  await editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const pageId = store.state.currentPageId
    const aligns = ['INSIDE', 'CENTER', 'OUTSIDE'] as const
    const corners = [
      { name: 'sharp', cornerRadius: 0, dashPattern: undefined },
      { name: 'rounded', cornerRadius: 24, dashPattern: undefined },
      { name: 'dashed', cornerRadius: 0, dashPattern: [20, 10] }
    ]
    for (const [row, align] of aligns.entries()) {
      for (const [column, corner] of corners.entries()) {
        store.graph.createNode('FRAME', pageId, {
          name: `${align} ${corner.name}`,
          x: 60 + column * 200,
          y: 60 + row * 170,
          width: 140,
          height: 120,
          cornerRadius: corner.cornerRadius,
          fills: [],
          clipsContent: false,
          strokes: [
            {
              type: 'SOLID',
              color: { r: 0.23, g: 0.4, b: 0.95, a: 1 },
              opacity: 0.5,
              visible: true,
              weight: 8,
              align,
              dashPattern: corner.dashPattern
            }
          ],
          strokeWeight: 8,
          strokeAlign: align,
          independentStrokeWeights: true,
          borderTopWeight: 8,
          borderRightWeight: 0,
          borderBottomWeight: 16,
          borderLeftWeight: 4
        })
      }
    }
    store.clearSelection()
    store.requestRender()
  })
  await editor.canvas.waitForRender()
  editor.canvas.assertNoErrors()
  // The corners are small next to the canvas: pin an absolute pixel budget below one corner.
  expect(await editor.canvas.screenshotCanvasRegion()).toMatchSnapshot('side-strokes.png', {
    maxDiffPixels: 24
  })
})
