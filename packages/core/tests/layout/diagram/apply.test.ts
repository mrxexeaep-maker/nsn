import { describe, expect, test } from 'bun:test'

import { expectDefined } from '#core-tests/helpers/assert'

import { SceneGraph } from '@open-pencil/scene-graph'
import { createConnector, freeEndpoint } from '@open-pencil/scene-graph/connectors'

import { layoutDiagram, type DiagramInput } from '#core/layout/diagram'
import { applyDiagramLayout } from '#core/layout/diagram/apply'

describe('applyDiagramLayout', () => {
  test('arranges existing layers and joins their connector by the sides the layout chose', async () => {
    const graph = new SceneGraph()
    const pageId = expectDefined(graph.getPages()[0]).id
    const section = graph.createNode('SECTION', pageId, { x: 500, y: 500 })
    const first = graph.createNode('RECTANGLE', pageId, { x: 300, y: 300, width: 100, height: 40 })
    const second = graph.createNode('RECTANGLE', section.id, { width: 100, height: 40 })
    const connector = createConnector(graph, pageId, {
      start: freeEndpoint(0, 0),
      end: freeEndpoint(0, 0)
    })
    const input: DiagramInput = {
      direction: 'LR',
      nodes: [
        { id: 'a', width: 100, height: 40 },
        { id: 'b', width: 100, height: 40, group: 'g' }
      ],
      groups: [{ id: 'g' }],
      edges: [{ id: 'ab', from: 'a', to: 'b' }]
    }
    const layout = await layoutDiagram(input)

    applyDiagramLayout(
      graph,
      input,
      layout,
      {
        boxes: new Map([
          ['a', first.id],
          ['b', second.id],
          ['g', section.id]
        ]),
        connectors: new Map([['ab', connector.id]])
      },
      { topLeft: { x: 0, y: 0 } }
    )

    const placedFirst = expectDefined(graph.getNode(first.id))
    const placedSection = expectDefined(graph.getNode(section.id))
    const placedSecond = expectDefined(graph.getNode(second.id))
    // The drawing starts at the top-left corner it was given.
    expect(Math.min(placedFirst.x, placedSection.x)).toBe(0)
    expect(Math.min(placedFirst.y, placedSection.y)).toBe(0)
    // The group's layer takes the layout's size and holds its member in its own axes.
    expect(placedSection.width).toBe(expectDefined(layout.groups.get('g')).width)
    expect(placedSecond.x).toBeGreaterThan(0)
    expect(placedSecond.x + placedSecond.width).toBeLessThan(placedSection.width)
    expect(placedFirst.x + placedFirst.width).toBeLessThan(placedSection.x)
    const joined = expectDefined(graph.getNode(connector.id))
    expect(joined.connectorStart).toMatchObject({ nodeId: first.id, magnet: 'RIGHT' })
    expect(joined.connectorEnd).toMatchObject({ nodeId: second.id, magnet: 'LEFT' })
  })
})
