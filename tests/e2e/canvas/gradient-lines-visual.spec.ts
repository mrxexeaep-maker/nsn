import { expect, test, useEditorSetupWithClear } from '#tests/e2e/fixtures'
import { strokeSceneDriver } from '#tests/helpers/canvas/strokes/driver'

const editor = useEditorSetupWithClear('/?test&no-chrome&no-rulers')
const scene = strokeSceneDriver(() => editor.page, 'createGradientLinesScene')

// A line has no height, or no width, and a gradient placed on a layer of that size used to throw
// on every frame. The gradient's colours along a line are checked in
// packages/core/tests/canvas/gradients.test.ts. A line is a small share of the picture, so the
// pixel budget is tighter than the default 1%, which would let a vanished line pass.
test('gradient strokes on straight lines', async () => {
  await scene.show()
  await editor.canvas.waitForRender()
  editor.canvas.assertNoErrors()
  expect(await editor.canvas.screenshotCanvasRegion(500, 460)).toMatchSnapshot(
    'gradient-lines.png',
    { threshold: 0.05, maxDiffPixelRatio: 0.002 }
  )
})
