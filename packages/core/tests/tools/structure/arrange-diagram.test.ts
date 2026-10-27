import { describe, expect, test } from 'bun:test'

import { FigmaAPI } from '@open-pencil/core/figma-api'
import { arrangeDiagramTool } from '@open-pencil/core/tools'
import { SceneGraph } from '@open-pencil/scene-graph'

describe('arrange_diagram', () => {
  test('lays out the layers it is given along the connectors joining them', async () => {
    const figma = new FigmaAPI(new SceneGraph())
    const [first, second] = [figma.createRectangle(), figma.createRectangle()]
    const connector = figma.createConnector()
    connector.connectorStart = { endpointNodeId: first.id, magnet: 'AUTO' }
    connector.connectorEnd = { endpointNodeId: second.id, magnet: 'AUTO' }

    expect(
      await arrangeDiagramTool.execute(figma, { ids: [first.id, second.id], direction: 'LR' })
    ).toEqual({ nodes: 2, groups: 0, connectors: 1 })
    expect(first.x + first.width).toBeLessThan(second.x)
  })

  test('reports layers it cannot lay out together', async () => {
    const figma = new FigmaAPI(new SceneGraph())
    const frame = figma.createFrame()
    const inside = figma.createRectangle()
    frame.appendChild(inside)
    expect(
      await arrangeDiagramTool.execute(figma, {
        ids: [figma.createRectangle().id, inside.id],
        direction: 'TB'
      })
    ).toEqual({
      error: 'Layers to arrange must share a parent, apart from those in chosen sections'
    })
  })
})
