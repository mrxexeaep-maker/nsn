import { afterAll, describe, expect, test } from 'bun:test'

import { expectDefined } from '#core-tests/helpers/assert'

import { SkiaRenderer } from '@open-pencil/core'
import { initCanvasKit } from '@open-pencil/core/io'
import { SceneGraph, type SceneNode } from '@open-pencil/scene-graph'

const SIZE = 300

const ck = await initCanvasKit()
const renderer = new SkiaRenderer(ck, expectDefined(ck.MakeSurface(SIZE, SIZE), 'surface'))
afterAll(() => renderer.destroy())

const RED = [
  { type: 'SOLID' as const, color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }
]

const SHADOW = {
  type: 'DROP_SHADOW' as const,
  color: { r: 0, g: 0, b: 0, a: 1 },
  offset: { x: 14, y: 14 },
  radius: 6,
  spread: 0,
  visible: true,
  blendMode: 'NORMAL' as const,
  showShadowBehindNode: false
}

type Scene = (graph: SceneGraph, parentId: string, opacity: number) => void

function alphaChannel(scene: Scene, opacity: number): Uint8Array {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  scene(graph, page.id, opacity)
  renderer.pageId = page.id
  const canvas = renderer.surface.getCanvas()
  canvas.clear(ck.TRANSPARENT)
  renderer.renderSceneToCanvas(canvas, graph, page.id)
  renderer.surface.flush()
  const image = renderer.surface.makeImageSnapshot()
  try {
    const rgba = expectDefined(
      image.readPixels(0, 0, {
        width: SIZE,
        height: SIZE,
        colorType: ck.ColorType.RGBA_8888,
        alphaType: ck.AlphaType.Unpremul,
        colorSpace: ck.ColorSpace.SRGB
      })
    )
    return Uint8Array.from({ length: SIZE * SIZE }, (_, pixel) => rgba[pixel * 4 + 3])
  } finally {
    image.delete()
  }
}

function worstDifference(actual: Uint8Array, expected: ArrayLike<number>): number {
  return actual.reduce(
    (worst, alpha, pixel) => Math.max(worst, Math.abs(alpha - expected[pixel])),
    0
  )
}

/** Half the opacity must halve every pixel's alpha, so no part of the layer is cut off. */
function expectHalfAsOpaque(scene: Scene) {
  const opaque = alphaChannel(scene, 1)
  const faded = alphaChannel(scene, 0.5)
  expect(opaque.filter((alpha) => alpha > 0).length).toBeGreaterThan(1000)
  const half = Array.from(opaque, (alpha) => alpha / 2)
  expect(worstDifference(faded, half)).toBeLessThanOrEqual(1)
}

function rectangle(props: Partial<SceneNode>): Scene {
  return (graph, parentId, opacity) => {
    graph.createNode('RECTANGLE', parentId, {
      x: 100,
      y: 80,
      width: 120,
      height: 60,
      fills: RED,
      opacity,
      ...props
    })
  }
}

describe('a layer drawn into an isolation layer', () => {
  test('draws whole when it is not transformed', () => {
    expectHalfAsOpaque(rectangle({}))
  })

  test('draws whole when it is rotated', () => {
    expectHalfAsOpaque(rectangle({ rotation: 30 }))
  })

  test('draws whole when it is rotated far from the page origin', () => {
    expectHalfAsOpaque(rectangle({ x: 150, y: 150, width: 100, height: 100, rotation: 45 }))
  })

  test('draws whole when it is rotated and flipped', () => {
    expectHalfAsOpaque(rectangle({ rotation: 30, flipX: true }))
  })

  test('draws its drop shadow whole when it is rotated', () => {
    expectHalfAsOpaque(rectangle({ rotation: 30, effects: [SHADOW] }))
  })

  test('draws whole inside a rotated frame', () => {
    expectHalfAsOpaque((graph, parentId, opacity) => {
      const frame = graph.createNode('FRAME', parentId, {
        x: 40,
        y: 20,
        width: 220,
        height: 200,
        rotation: 20,
        fills: [],
        clipsContent: false
      })
      rectangle({ x: 60, y: 40 })(graph, frame.id, opacity)
    })
  })

  test('draws whole with a blend mode when it is rotated', () => {
    const normal = alphaChannel(rectangle({ rotation: 30 }), 1)
    const multiplied = alphaChannel(rectangle({ rotation: 30, blendMode: 'MULTIPLY' }), 1)
    expect(worstDifference(multiplied, normal)).toBeLessThanOrEqual(1)
  })
})
