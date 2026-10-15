import { expect, test } from 'bun:test'

import { captureGraphCheckpoint, SceneGraph } from '@open-pencil/scene-graph'

test('incremental checkpoints copy only announced mutations and release their observer', () => {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const text = graph.createNode('TEXT', page.id, { text: 'Before' })
  const untouched = graph.createNode('FRAME', page.id)
  const checkpoint = captureGraphCheckpoint(graph, { incremental: true })
  expect(checkpoint.nodes.size).toBe(0)
  graph.updateNode(text.id, { text: 'After' })
  graph.updateNode(text.id, { width: 240 })
  expect([...checkpoint.nodes.keys()]).toEqual([text.id])
  expect(checkpoint.nodes.get(text.id)?.text).toBe('Before')
  checkpoint.assertPropertiesOnly()
  checkpoint.restore()
  expect(graph.getNode(text.id)).toBe(text)
  expect(text.text).toBe('Before')
  graph.updateNode(untouched.id, { width: 400 })
  expect(checkpoint.nodes.has(untouched.id)).toBe(false)
})

test('incremental rollback restores deleted hierarchy and removes newly created nodes', () => {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const frame = graph.createNode('FRAME', page.id)
  const text = graph.createNode('TEXT', frame.id, { text: 'Kept' })
  const checkpoint = captureGraphCheckpoint(graph, { incremental: true })
  graph.deleteNode(frame.id)
  const replacement = graph.createNode('FRAME', page.id)
  expect(() => checkpoint.assertPropertiesOnly()).toThrow()
  checkpoint.restore()
  expect(graph.getNode(replacement.id)).toBeUndefined()
  expect(graph.getNode(frame.id)).toBe(frame)
  expect(graph.getNode(text.id)).toBe(text)
  expect(frame.childIds).toEqual([text.id])
  expect(page.childIds).toContain(frame.id)
})
