import { describe, expect, test } from 'bun:test'

import { expectDefined } from '#core-tests/helpers/assert'

import { SceneGraph, type SceneNode } from '@open-pencil/scene-graph'
import { boundEndpoint, createConnector } from '@open-pencil/scene-graph/connectors'
import type { Rect } from '@open-pencil/scene-graph/primitives'

import { arrangeDiagram } from '#core/layout/diagram/arrange'

function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** A page with layers piled on each other, as an agent drawing blindly leaves them. */
function pile() {
  const graph = new SceneGraph()
  const pageId = expectDefined(graph.getPages()[0]).id
  const box = (name: string, parentId = pageId) =>
    graph.createNode('RECTANGLE', parentId, { name, x: 100, y: 100, width: 120, height: 50 })
  const join = (from: SceneNode, to: SceneNode, lineType?: 'STRAIGHT') =>
    createConnector(graph, pageId, {
      start: boundEndpoint(from.id),
      end: boundEndpoint(to.id),
      ...(lineType ? { lineType } : {})
    })
  return { graph, pageId, box, join }
}

const node = (graph: SceneGraph, id: string) => expectDefined(graph.getNode(id))

describe('arrangeDiagram', () => {
  test('spreads piled layers into ranks along the flow and reroutes their connectors', async () => {
    const { graph, box, join } = pile()
    const [a, b, c] = [box('A'), box('B'), box('C')]
    const ab = join(a, b)
    const ac = join(a, c)

    const result = await arrangeDiagram(graph, [a.id, b.id, c.id], 'TB')

    expect(result).toEqual({ nodes: 3, groups: 0, connectors: 2 })
    const [placedA, placedB, placedC] = [a, b, c].map((layer) => node(graph, layer.id))
    expect(overlap(placedB, placedC)).toBe(false)
    expect(placedA.y + placedA.height).toBeLessThan(Math.min(placedB.y, placedC.y))
    // The drawing keeps its top-left corner.
    expect(Math.min(placedA.x, placedB.x, placedC.x)).toBe(100)
    expect(Math.min(placedA.y, placedB.y, placedC.y)).toBe(100)
    for (const connector of [ab, ac]) {
      const routed = node(graph, connector.id)
      expect(routed.connectorStart).toMatchObject({ nodeId: a.id, magnet: 'BOTTOM' })
      expect(routed.connectorEnd?.magnet).toBe('TOP')
    }
  })

  test('lays a section out around its layers only when all of them were chosen', async () => {
    const { graph, pageId, box, join } = pile()
    const start = box('Start')
    const section = graph.createNode('SECTION', pageId, {
      name: 'Steps',
      x: 0,
      y: 0,
      width: 50,
      height: 50
    })
    const [one, two] = [box('One', section.id), box('Two', section.id)]
    join(start, one)
    join(one, two)

    expect(await arrangeDiagram(graph, [start.id, section.id, one.id, two.id], 'LR')).toMatchObject(
      { nodes: 3, groups: 1 }
    )
    const placed = node(graph, section.id)
    for (const inner of [one, two]) {
      const child = node(graph, inner.id)
      expect(child.x).toBeGreaterThan(0)
      expect(child.x + child.width).toBeLessThan(placed.width)
      expect(child.y + child.height).toBeLessThan(placed.height)
    }

    // A section holding a layer that was not chosen moves as one box and keeps its size.
    const other = pile()
    const first = other.box('First')
    const held = other.graph.createNode('SECTION', other.pageId, {
      x: 400,
      y: 400,
      width: 300,
      height: 200
    })
    const inside = other.box('Inside', held.id)
    other.join(first, held)
    expect(await arrangeDiagram(other.graph, [first.id, held.id], 'TB')).toMatchObject({
      nodes: 2,
      groups: 0
    })
    expect(node(other.graph, held.id)).toMatchObject({ width: 300, height: 200 })
    expect(node(other.graph, inside.id)).toMatchObject({ x: 100, y: 100 })
  })

  test('keeps where a connector attaches inside a box, and a straight line its ends', async () => {
    const { graph, pageId, box, join } = pile()
    const frame = graph.createNode('FRAME', pageId, { x: 0, y: 0, width: 300, height: 200 })
    const button = box('Button', frame.id)
    const target = box('Target')
    const inner = join(button, target)
    const straight = join(target, box('Next'), 'STRAIGHT')
    const before = node(graph, straight.id)

    const result = await arrangeDiagram(
      graph,
      [frame.id, target.id, expectDefined(before.connectorEnd?.nodeId)],
      'TB'
    )

    expect(result.connectors).toBe(1)
    expect(node(graph, inner.id).connectorStart?.nodeId).toBe(button.id)
    expect(node(graph, straight.id).connectorStart).toEqual(before.connectorStart)
    expect(node(graph, straight.id).connectorEnd).toEqual(before.connectorEnd)
  })

  test('refuses layers with different parents outside chosen sections', async () => {
    const { graph, pageId, box } = pile()
    const frame = graph.createNode('FRAME', pageId, { width: 300, height: 200 })
    await expect(
      arrangeDiagram(graph, [box('Page').id, box('Framed', frame.id).id], 'TB')
    ).rejects.toThrow('must share a parent')
  })
})
