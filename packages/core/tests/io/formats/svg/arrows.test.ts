import { describe, expect, test } from 'bun:test'

import { expectDefined } from '#core-tests/helpers/assert'

import { renderNodesToSVG } from '@open-pencil/core/io/formats/svg'
import { SceneGraph, type SceneNode, type Stroke, type StrokeCap } from '@open-pencil/scene-graph'
import { createConnector, freeEndpoint } from '@open-pencil/scene-graph/connectors'

const black = (weight: number, cap?: StrokeCap): Stroke => ({
  type: 'SOLID',
  color: { r: 0, g: 0, b: 0, a: 1 },
  opacity: 1,
  visible: true,
  weight,
  align: 'CENTER',
  cap
})

function exported(build: (graph: SceneGraph, pageId: string) => SceneNode): string {
  const graph = new SceneGraph()
  const pageId = graph.getPages()[0].id
  const node = build(graph, pageId)
  return expectDefined(renderNodesToSVG(graph, pageId, [node.id], { xmlDeclaration: false }))
}

/** A vector bent once at its middle, open at both ends. */
function bent(cornerRadius: number, cap: StrokeCap): Partial<SceneNode> {
  const straight = { x: 0, y: 0 }
  return {
    width: 200,
    height: 60,
    cornerRadius,
    strokes: [black(3, cap)],
    vectorNetwork: {
      vertices: [
        { x: 0, y: 60 },
        { x: 100, y: 0 },
        { x: 200, y: 60 }
      ],
      segments: [
        { start: 0, end: 1, tangentStart: straight, tangentEnd: straight },
        { start: 1, end: 2, tangentStart: straight, tangentEnd: straight }
      ],
      regions: []
    }
  }
}

describe('arrow heads exported to SVG', () => {
  test('a line ends in filled heads, its shaft stopping inside them', () => {
    const plain = exported((graph, page) =>
      graph.createNode('LINE', page, { width: 300, height: 0, strokes: [black(6, 'ROUND')] })
    )
    const headed = exported((graph, page) =>
      graph.createNode('LINE', page, {
        width: 300,
        height: 0,
        strokes: [black(6, 'TRIANGLE_FILLED')]
      })
    )
    const end = (svg: string) => Number(expectDefined(/<line\b[^>]* x2="([\d.]+)"/.exec(svg))[1])
    expect(end(headed)).toBeLessThan(end(plain))
    expect(headed.match(/<path d="M[^"]+Z" fill="#000000"/g)).toHaveLength(2)
  })

  test('a connector’s line arrow is two wings stroked with round ends, a dot a circle', () => {
    const svg = exported((graph, page) =>
      createConnector(
        graph,
        page,
        { start: freeEndpoint(0, 0), end: freeEndpoint(200, 0) },
        { connectorStartCap: 'CIRCLE_FILLED', connectorEndCap: 'ARROW_LINES' }
      )
    )
    expect(svg).toMatch(/<path d="M[^"]+L[^"]+L[^"]+" fill="none"[^>]*stroke-linecap="round"/)
    expect(svg).toContain('<circle ')
  })

  test('an open path keeps its rounded corner and carries its heads', () => {
    const corner = (radius: number) =>
      exported((graph, page) => graph.createNode('VECTOR', page, bent(radius, 'TRIANGLE_FILLED')))
    const shaft = (svg: string) => expectDefined(/<path d="([^"]+)" fill="none"/.exec(svg))[1]
    expect(shaft(corner(16))).toContain('C')
    expect(shaft(corner(0))).not.toContain('C')
    expect(corner(16).match(/<path d="M[^"]+Z" fill="#000000"/g)).toHaveLength(2)
  })
})
