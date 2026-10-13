import { describe, expect, test } from 'bun:test'

import type { VectorSegment } from '@open-pencil/scene-graph'

import { VECTOR_ICON_SIZE, vectorIconPath } from '#core/vector/icon-path'

const zero = { x: 0, y: 0 }
const line = (start: number, end: number): VectorSegment => ({
  start,
  end,
  tangentStart: zero,
  tangentEnd: zero
})

/** The x, y pairs a path's commands move through. */
function points(path: string | null): number[][] {
  const numbers = (path ?? '').match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  const pairs: number[][] = []
  for (let index = 0; index < numbers.length; index += 2)
    pairs.push(numbers.slice(index, index + 2))
  return pairs
}

describe('a vector’s layer icon', () => {
  test('draws its shape fitted to the icon and centered, keeping its proportions', () => {
    // A triangle 200 wide and 100 tall, far from the origin.
    const path = vectorIconPath({
      vertices: [
        { x: 500, y: 500 },
        { x: 700, y: 500 },
        { x: 600, y: 600 }
      ],
      segments: [line(0, 1), line(1, 2), line(2, 0)],
      regions: []
    })
    expect(path?.endsWith('Z')).toBe(true)
    const xs = points(path).map(([x]) => x)
    const ys = points(path).map(([, y]) => y)
    // Width fills the icon less its padding; height is half of that, centered.
    expect(Math.min(...xs)).toBeCloseTo(1.5, 2)
    expect(Math.max(...xs)).toBeCloseTo(VECTOR_ICON_SIZE - 1.5, 2)
    expect(Math.min(...ys)).toBeCloseTo(4.75, 2)
    expect(Math.max(...ys)).toBeCloseTo(11.25, 2)
  })

  test('keeps a straight line’s slope', () => {
    const path = vectorIconPath({
      vertices: [zero, { x: 30, y: 10 }],
      segments: [line(0, 1)],
      regions: []
    })
    const [[x1, y1], [x2, y2]] = points(path)
    expect((y2 - y1) / (x2 - x1)).toBeCloseTo(1 / 3, 2)
  })

  test('has nothing to draw without segments or extent', () => {
    expect(vectorIconPath({ vertices: [zero], segments: [], regions: [] })).toBeNull()
    expect(
      vectorIconPath({ vertices: [zero, zero], segments: [line(0, 1)], regions: [] })
    ).toBeNull()
  })
})
