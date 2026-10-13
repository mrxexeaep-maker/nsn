import { describe, expect, test } from 'bun:test'

import { SceneGraph, withIcon } from '@open-pencil/scene-graph'
import { buildLayerTreeModel, patchLayerNode } from '@open-pencil/vue'

describe('layer tree model', () => {
  test('marks icon frames, so rows can show them as icons', () => {
    const graph = new SceneGraph()
    const pageId = graph.getPages()[0].id
    const frame = graph.createNode('FRAME', pageId, { name: 'Frame' })
    const icon = graph.createNode('FRAME', pageId, { name: 'cat' })
    graph.updateNode(icon.id, { pluginData: withIcon(icon, { name: 'mdi:cat' }) })

    const model = buildLayerTreeModel(graph, pageId)
    expect(model.byId.get(icon.id)?.icon).toBe(true)
    expect(model.byId.get(frame.id)?.icon).toBe(false)

    const row = model.byId.get(frame.id)
    if (!row) throw new Error('Expected the frame in the model')
    graph.updateNode(frame.id, { pluginData: withIcon(frame, { name: 'mdi:home' }) })
    expect(patchLayerNode(row, frame)).toBe(true)
    expect(row.icon).toBe(true)
  })

  test('carries the variable modes set on a layer itself, so rows can tag them', () => {
    const graph = new SceneGraph()
    const pageId = graph.getPages()[0].id
    const theme = graph.createCollection('Theme')
    const dark = graph.createMode(theme.id, 'Dark') ?? ''
    const frame = graph.createNode('FRAME', pageId, { name: 'Frame' })

    const model = buildLayerTreeModel(graph, pageId)
    const row = model.byId.get(frame.id)
    if (!row) throw new Error('Expected the frame in the model')
    expect(row.modeIds).toBeUndefined()

    graph.updateNode(frame.id, { variableModes: { [theme.id]: dark } })
    expect(patchLayerNode(row, frame)).toBe(true)
    expect(row.modeIds).toEqual([dark])
  })
})
