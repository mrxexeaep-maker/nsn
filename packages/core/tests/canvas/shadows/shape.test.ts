import { afterAll, describe, test } from 'bun:test'

import { SkiaRenderer } from '@open-pencil/core'
import { initCanvasKit } from '@open-pencil/core/io'

import { expectDefined } from '#core-tests/helpers/assert'
import { expectFigmaRow, renderRow, type FigmaRowScene } from '#core-tests/helpers/figma-rows'

const ck = await initCanvasKit()
const renderer = new SkiaRenderer(ck, expectDefined(ck.MakeSurface(1, 1)))
afterAll(() => renderer.destroy())

function roundedSquare(opacity: number): FigmaRowScene {
  return (graph, hostId) =>
    graph.createNode('RECTANGLE', hostId, {
      x: 120,
      y: 70,
      width: 160,
      height: 160,
      cornerRadius: 40,
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity, visible: true }],
      effects: [
        {
          type: 'INNER_SHADOW',
          radius: 0,
          spread: 6,
          offset: { x: 8, y: 8 },
          color: { r: 0, g: 0, b: 0, a: 1 },
          visible: true,
          blendMode: 'NORMAL',
          showShadowBehindNode: false
        }
      ]
    })
}

// Figma 126 paints the shadowed edge of a rounded rectangle in the shadow alone, at the edge's
// coverage and at full strength over a translucent fill: row 90 from x 119 to 139 of its export.
const FIGMA_RED = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const FIGMA_ALPHA = [0, 0, 0, 223, 255, 255, 255, 255, 255, 255, 255]

describe('an inner shadow over a rounded edge', () => {
  for (const opacity of [1, 0.5]) {
    test(`shows none of a fill at ${opacity * 100}% through the edge`, () => {
      const scene = roundedSquare(opacity)
      expectFigmaRow(renderRow(ck, renderer, scene, 90, 119, 139, 0), FIGMA_RED)
      expectFigmaRow(renderRow(ck, renderer, scene, 90, 119, 139), FIGMA_ALPHA)
    })
  }
})
