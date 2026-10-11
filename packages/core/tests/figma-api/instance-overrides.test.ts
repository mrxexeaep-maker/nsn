import { expect, test } from 'bun:test'

import { FigmaAPI, type FigmaNodeProxy } from '@open-pencil/core/figma-api'
import { hasInstanceOverride, SceneGraph } from '@open-pencil/scene-graph'

// Recorded with the same script in Figma desktop 126.

function setup() {
  const graph = new SceneGraph()
  const figma = new FigmaAPI(graph)
  const component = figma.createComponent()
  component.resize(100, 100)
  component.appendChild(figma.createRectangle())
  const instance = component.createInstance()
  const [layer] = instance.children as FigmaNodeProxy[]
  return { graph, instance, layer }
}

test('a layer inside an instance refuses the fields it always takes from its component', () => {
  const { layer } = setup()
  const refused = (setter: string, property: string) =>
    `in set_${setter}: This property cannot be overridden in an instance: ${property}`
  expect(() => (layer.x = 5)).toThrow(refused('x', 'relative-transform'))
  expect(() => (layer.y = 5)).toThrow(refused('y', 'relative-transform'))
  expect(() => (layer.rotation = 10)).toThrow(refused('rotation', 'relative-transform'))
  expect(() => (layer.relativeTransform = [[1, 0, 3], [0, 1, 3]])).toThrow(
    refused('relativeTransform', 'relative-transform')
  )
  expect(() => (layer.constraints = { horizontal: 'MAX', vertical: 'MIN' })).toThrow(
    refused('constraints', 'vertical-constraint')
  )
  expect(() => (layer.isMask = true)).toThrow(refused('isMask', 'is-mask'))
  expect(() => (layer.maskType = 'LUMINANCE')).toThrow(refused('maskType', 'mask-type'))
})

test('a layer inside an instance can be locked and restyled, each recorded as an override', () => {
  const { graph, instance, layer } = setup()
  layer.locked = true
  layer.strokeWeight = 4
  expect(hasInstanceOverride(graph, layer.id, 'locked')).toBe(true)
  expect(hasInstanceOverride(graph, layer.id, 'strokeWeight')).toBe(true)
  // The instance itself still moves.
  instance.x = 40
  expect(instance.x).toBe(40)
})
