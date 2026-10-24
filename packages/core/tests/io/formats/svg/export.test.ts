import { describe, expect, test } from 'bun:test'

import { expectDefined } from '#core-tests/helpers/assert'

import { renderNodesToSVG, type SVGExportOptions } from '@open-pencil/core/io/formats/svg'
import { SceneGraph, type SceneNode, type Stroke } from '@open-pencil/scene-graph'

/** The attributes of the `<line>` an SVG export writes for a line with a 6 px black stroke. */
function exportedLine(
  props: Partial<SceneNode>,
  stroke: Partial<Stroke> = {}
): Map<string, string> {
  const graph = new SceneGraph()
  const page = graph.getPages()[0].id
  const line = graph.createNode('LINE', page, {
    width: 300,
    height: 0,
    strokeWeight: 6,
    ...props,
    strokes: [
      {
        type: 'SOLID',
        color: { r: 0, g: 0, b: 0, a: 1 },
        opacity: 1,
        visible: true,
        weight: 6,
        align: 'CENTER',
        ...stroke
      }
    ]
  })
  const svg = expectDefined(renderNodesToSVG(graph, page, [line.id]), 'SVG output')
  const element = expectDefined(/<line\b([^>]*)>/.exec(svg), 'line element')[1]
  return new Map(
    Array.from(element.matchAll(/([\w-]+)="([^"]*)"/g), ([, name, value]) => [name, value])
  )
}

// The canvas strokes a line as Figma 126 does; its export draws the same.
describe('a line exported to SVG', () => {
  test('takes its cap from the layer when the stroke has none, pulled in to end with the line', () => {
    const line = exportedLine({ strokeCap: 'ROUND' })
    expect(line.get('stroke-linecap')).toBe('round')
    expect(line.get('x1')).toBe('3')
    expect(line.get('x2')).toBe('297')
    expect(line.get('y1')).toBe('-3')
  })

  test('stretches its dashes to whole periods, with half a dash at each end', () => {
    // Dashes of 10 and gaps of 5 fit 20 times into 300 and 7 times, stretched, into 100: Figma's
    // stroke geometry for the 100 px line starts with a dash from 0 to 4.7619, which SVG rounds.
    const long = exportedLine({}, { dashPattern: [10, 5] })
    expect(long.get('stroke-dasharray')).toBe('10 5')
    expect(long.get('stroke-dashoffset')).toBe('5')
    const short = exportedLine({ width: 100 }, { dashPattern: [10, 5] })
    expect(Number(short.get('stroke-dashoffset'))).toBeCloseTo(4.7619, 1)
  })
})

function svgOf(
  build: (graph: SceneGraph, pageId: string) => string[],
  options: SVGExportOptions = {}
): string {
  const graph = new SceneGraph()
  const pageId = graph.getPages()[0].id
  return expectDefined(
    renderNodesToSVG(graph, pageId, build(graph, pageId), { xmlDeclaration: false, ...options }),
    'SVG output'
  )
}

function rects(svg: string): string[] {
  return Array.from(svg.matchAll(/<rect\b[^>]*>/g), ([element]) => element)
}

// Solid fill opacity is a paint attribute. Baking it into the layer would also fade strokes.
describe('solid paint opacity exported to SVG', () => {
  test('keeps sRGB fill opacities and leaves a fully opaque fill unchanged', () => {
    const build = (graph: SceneGraph, pageId: string) => {
      const frame = graph.createNode('FRAME', pageId, { width: 120, height: 40 })
      for (const [index, opacity] of [0, 0.4, 1].entries()) {
        graph.createNode('RECTANGLE', frame.id, {
          x: index * 40,
          width: 40,
          height: 40,
          fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity, visible: true }]
        })
      }
      return [frame.id]
    }

    expect(rects(svgOf(build, { colorSpace: 'srgb' }))).toEqual([
      '<rect width="40" height="40" fill="#000000" fill-opacity="0"/>',
      '<rect width="40" height="40" fill="#000000" fill-opacity="0.4"/>',
      '<rect width="40" height="40" fill="#000000"/>'
    ])
    expect(rects(svgOf(build, { colorSpace: 'display-p3' }))).toEqual([
      '<rect width="40" height="40" fill="color(display-p3 0 0 0 / 0)"/>',
      '<rect width="40" height="40" fill="color(display-p3 0 0 0 / 0.4)"/>',
      '<rect width="40" height="40" fill="color(display-p3 0 0 0)"/>'
    ])
  })

  test('multiplies a solid fill color alpha by its opacity', () => {
    const svg = svgOf((graph, pageId) => [
      graph.createNode('RECTANGLE', pageId, {
        width: 40,
        height: 40,
        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 0.5 }, opacity: 0.5, visible: true }]
      }).id
    ])
    expect(rects(svg)).toEqual([
      '<rect width="40" height="40" fill="#000000" fill-opacity="0.25"/>'
    ])
  })

  test('fades the fill without fading an opaque stroke', () => {
    const svg = svgOf((graph, pageId) => [
      graph.createNode('RECTANGLE', pageId, {
        width: 40,
        height: 40,
        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 0.4, visible: true }],
        strokes: [
          {
            type: 'SOLID',
            color: { r: 1, g: 0, b: 0, a: 1 },
            opacity: 1,
            visible: true,
            weight: 1,
            align: 'CENTER'
          }
        ]
      }).id
    ])
    expect(svg).toContain(
      '<rect width="40" height="40" fill="#000000" fill-opacity="0.4" stroke="#FF0000" stroke-width="1"/>'
    )
    expect(svg).not.toMatch(/(^|\s)opacity="/)
  })

  test('keeps each fill opacity when a shape has more than one', () => {
    const svg = svgOf((graph, pageId) => [
      graph.createNode('RECTANGLE', pageId, {
        width: 40,
        height: 40,
        fills: [
          { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 0.4, visible: true },
          { type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true }
        ],
        strokes: [
          {
            type: 'SOLID',
            color: { r: 0, g: 0, b: 0, a: 1 },
            opacity: 0.5,
            visible: true,
            weight: 2,
            align: 'CENTER'
          }
        ]
      }).id
    ])
    expect(rects(svg)).toEqual([
      '<rect width="40" height="40" fill="#FF0000" fill-opacity="0.4"/>',
      '<rect width="40" height="40" fill="#0000FF" stroke="#000000" stroke-width="2" stroke-opacity="0.5"/>'
    ])
  })

  test('keeps stroke opacity, including alpha in the stroke color', () => {
    const stroke = (graph: SceneGraph, pageId: string, color: Stroke['color'], opacity: number) =>
      graph.createNode('RECTANGLE', pageId, {
        width: 40,
        height: 40,
        strokes: [{ type: 'SOLID', color, opacity, visible: true, weight: 2, align: 'CENTER' }]
      }).id

    const partial = svgOf((graph, pageId) => [
      stroke(graph, pageId, { r: 0, g: 0, b: 0, a: 1 }, 0.4)
    ])
    expect(partial).toContain(
      '<rect width="40" height="40" fill="none" stroke="#000000" stroke-width="2" stroke-opacity="0.4"/>'
    )

    const colorAlpha = svgOf((graph, pageId) => [
      stroke(graph, pageId, { r: 0, g: 0, b: 0, a: 0.5 }, 1)
    ])
    expect(colorAlpha).toContain(
      '<rect width="40" height="40" fill="none" stroke="#000000" stroke-width="2" stroke-opacity="0.5"/>'
    )

    const both = svgOf((graph, pageId) => [
      stroke(graph, pageId, { r: 0, g: 0, b: 0, a: 0.5 }, 0.4)
    ])
    expect(both).toContain(
      '<rect width="40" height="40" fill="none" stroke="#000000" stroke-width="2" stroke-opacity="0.2"/>'
    )

    // Display P3 already stores color alpha in the stroke color, so stroke-opacity stays the paint opacity.
    const p3 = svgOf(
      (graph, pageId) => [stroke(graph, pageId, { r: 0, g: 0, b: 0, a: 0.5 }, 0.4)],
      { colorSpace: 'display-p3' }
    )
    expect(p3).toContain(
      '<rect width="40" height="40" fill="none" stroke="color(display-p3 0 0 0 / 0.5)" stroke-width="2" stroke-opacity="0.4"/>'
    )
  })

  test('keeps text fill opacity, and an opaque run does not inherit it', () => {
    const svg = svgOf((graph, pageId) => [
      graph.createNode('TEXT', pageId, {
        text: 'Ab',
        width: 40,
        height: 20,
        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 0.4, visible: true }],
        styleRuns: [
          { start: 0, length: 1, style: {} },
          {
            start: 1,
            length: 1,
            style: {
              fills: [
                { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }
              ]
            }
          }
        ]
      }).id
    ])
    expect(svg).toContain(
      '<text x="0" y="14" font-family="Inter" font-size="14" fill="#000000" fill-opacity="0.4"><tspan>A</tspan><tspan fill="#FF0000" fill-opacity="1">b</tspan></text>'
    )
  })
})
