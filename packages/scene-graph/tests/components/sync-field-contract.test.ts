import { expect, test } from 'bun:test'

import { SceneGraph, setInstanceOverride, type SceneNode } from '@open-pencil/scene-graph'

import { expectDefined } from '../helpers/assert'

for (const protectedField of ['width', 'text'] as const) {
  test(`component synchronization preserves ${protectedField} without freezing other fields`, () => {
    const graph = new SceneGraph()
    const component = graph.createNode('COMPONENT', graph.getPages()[0].id)
    const source = graph.createNode('TEXT', component.id, {
      text: 'Source',
      visible: false,
      width: 80
    })
    const instance = expectDefined(graph.createInstance(component.id, graph.getPages()[0].id))
    const clone = graph.getChildren(instance.id)[0]
    graph.updateNode(clone.id, { text: 'Override', visible: true, width: 160 })
    setInstanceOverride(instance.instanceOverrides, instance.id, clone.id, protectedField, true)
    graph.syncInstances(component.id)
    expect(clone.text).toBe(protectedField === 'text' ? 'Override' : source.text)
    expect(clone.width).toBe(protectedField === 'width' ? 160 : 80)
    expect(clone.visible).toBe(false)
  })
}

test('component synchronization updates and removes opacity bindings while preserving a claimed width binding', () => {
  const graph = new SceneGraph()
  const component = graph.createNode('COMPONENT', graph.getPages()[0].id, {
    opacity: 0.5,
    boundVariables: { opacity: 'opacity-var' }
  })
  const instance = expectDefined(graph.createInstance(component.id, graph.getPages()[0].id))
  expect(instance.opacity).toBe(0.5)
  expect(instance.boundVariables.opacity).toBe('opacity-var')
  graph.updateNode(instance.id, {
    boundVariables: { ...instance.boundVariables, width: 'width-var' }
  })
  setInstanceOverride(
    instance.instanceOverrides,
    instance.id,
    instance.id,
    'boundVariables/width',
    true
  )
  graph.updateNode(component.id, { opacity: 1, boundVariables: {} })
  graph.syncInstances(component.id)
  expect(instance.boundVariables).toEqual({ width: 'width-var' })
  expect(instance.opacity).toBe(1)
})

test('a component edit reaches every field its instances do not override, as in Figma', () => {
  // Repeats a Figma desktop 126 script: move, rotate, and restyle the component's layers.
  const graph = new SceneGraph()
  const page = graph.getPages()[0].id
  const card = graph.createNode('COMPONENT', page, { width: 200, height: 100 })
  const dot = graph.createNode('RECTANGLE', card.id, {
    name: 'Dot',
    x: 170,
    y: 10,
    width: 20,
    height: 20,
    horizontalConstraint: 'MAX'
  })
  const bar = graph.createNode('RECTANGLE', card.id, {
    name: 'Bar',
    x: 20,
    y: 60,
    width: 100,
    height: 10,
    strokeWeight: 1
  })
  const plain = expectDefined(graph.createInstance(card.id, page))
  const wide = expectDefined(graph.createInstance(card.id, page, { width: 300 }))
  setInstanceOverride(wide.instanceOverrides, wide.id, wide.id, 'width', 300)
  const overridden = expectDefined(graph.createInstance(card.id, page))
  const overriddenBar = graph.getChildren(overridden.id)[1]
  graph.updateNode(overriddenBar.id, { strokeWeight: 6 })
  setInstanceOverride(
    overridden.instanceOverrides,
    overridden.id,
    overriddenBar.id,
    'strokeWeight',
    6
  )

  graph.updateNode(dot.id, { x: 150, y: 30, rotation: 30 })
  graph.updateNode(bar.id, { x: 40, strokeWeight: 3, strokeAlign: 'OUTSIDE', cornerSmoothing: 0.6 })
  graph.syncInstances(card.id)

  const read = (instance: SceneNode) => {
    const [copyDot, copyBar] = graph.getChildren(instance.id)
    return {
      dot: [copyDot.x, copyDot.y, copyDot.rotation],
      bar: [copyBar.x, copyBar.strokeWeight, copyBar.strokeAlign, copyBar.cornerSmoothing]
    }
  }
  expect(read(plain)).toEqual({ dot: [150, 30, 30], bar: [40, 3, 'OUTSIDE', 0.6] })
  // A wider instance places the right-pinned dot by its constraint.
  expect(read(wide).dot).toEqual([250, 30, 30])
  expect(read(overridden).bar).toEqual([40, 6, 'OUTSIDE', 0.6])
})

test('a layer in an auto layout flow takes its place from the layout, not the component', () => {
  const graph = new SceneGraph()
  const page = graph.getPages()[0].id
  const row = graph.createNode('COMPONENT', page, {
    layoutMode: 'HORIZONTAL',
    width: 100,
    height: 20
  })
  const item = graph.createNode('RECTANGLE', row.id, { x: 0, y: 0, width: 20, height: 20 })
  const instance = expectDefined(graph.createInstance(row.id, page))
  const copy = graph.getChildren(instance.id)[0]
  graph.updateNode(copy.id, { x: 12 })
  graph.updateNode(item.id, { x: 30, cornerSmoothing: 0.6 })
  graph.syncInstances(row.id)
  expect([copy.x, copy.cornerSmoothing]).toEqual([12, 0.6])
})

test('restyled ranges reach instances, except one that overrides its text', () => {
  const graph = new SceneGraph()
  const page = graph.getPages()[0].id
  const label = graph.createNode('COMPONENT', page)
  const text = graph.createNode('TEXT', label.id, { text: 'Hello' })
  const plain = expectDefined(graph.createInstance(label.id, page))
  const instance = expectDefined(graph.createInstance(label.id, page))
  const copy = graph.getChildren(instance.id)[0]
  const runs = [{ start: 0, length: 2, style: { fontWeight: 700 } }]
  graph.updateNode(copy.id, { text: 'Hi there', styleRuns: runs })
  setInstanceOverride(instance.instanceOverrides, instance.id, copy.id, 'text', 'Hi there')
  const italic = [{ start: 0, length: 5, style: { italic: true } }]
  graph.updateNode(text.id, { styleRuns: italic })
  graph.syncInstances(label.id)
  expect(graph.getChildren(plain.id)[0].styleRuns).toEqual(italic)
  expect(copy.styleRuns).toEqual(runs)
})

test('a copy that sizes itself to its own content keeps that size through a component edit', () => {
  // A badge's count, as in gold-preview's lists: the instance's text is its own, the component's
  // a longer placeholder, and Figma sizes the count and its hugging frame to the instance's text.
  const graph = new SceneGraph()
  const page = graph.getPages()[0].id
  const badge = graph.createNode('COMPONENT', page, {
    width: 76,
    height: 18,
    layoutMode: 'HORIZONTAL',
    primaryAxisSizing: 'HUG',
    counterAxisSizing: 'HUG'
  })
  const label = graph.createNode('FRAME', badge.id, {
    width: 60,
    height: 16,
    layoutMode: 'HORIZONTAL',
    primaryAxisSizing: 'HUG',
    counterAxisSizing: 'HUG'
  })
  const text = graph.createNode('TEXT', label.id, {
    text: 'Badge-sm',
    width: 60,
    height: 16,
    textAutoResize: 'WIDTH_AND_HEIGHT'
  })
  const instance = expectDefined(graph.createInstance(badge.id, page))
  const [copyLabel] = graph.getChildren(instance.id)
  const [copyText] = graph.getChildren(copyLabel.id)
  graph.updateNode(copyText.id, { text: '2', width: 8 })
  graph.updateNode(copyLabel.id, { width: 8 })
  graph.updateNode(instance.id, { width: 24 })
  setInstanceOverride(instance.instanceOverrides, instance.id, copyText.id, 'text', true)

  graph.updateNode(text.id, { width: 64, letterSpacing: 1 })
  graph.updateNode(label.id, { width: 64 })
  graph.syncInstances(badge.id)
  expect([copyText.text, copyText.width, copyLabel.width, instance.width]).toEqual(['2', 8, 8, 24])
  expect(copyText.letterSpacing).toBe(1)
})

test('a copy takes the component’s size once the component stops hugging its layers', () => {
  const graph = new SceneGraph()
  const page = graph.getPages()[0].id
  const badge = graph.createNode('COMPONENT', page, { width: 76, height: 18 })
  const label = graph.createNode('FRAME', badge.id, {
    width: 60,
    height: 16,
    layoutMode: 'HORIZONTAL',
    primaryAxisSizing: 'HUG',
    counterAxisSizing: 'HUG'
  })
  const instance = expectDefined(graph.createInstance(badge.id, page))
  const [copyLabel] = graph.getChildren(instance.id)
  graph.updateNode(copyLabel.id, { width: 8 })

  graph.updateNode(label.id, { primaryAxisSizing: 'FIXED', width: 64 })
  graph.syncInstances(badge.id)
  expect([copyLabel.primaryAxisSizing, copyLabel.width]).toEqual(['FIXED', 64])
})

test('text a property gives a copy when its layer is linked later drops the size saved for the old text', () => {
  const graph = new SceneGraph()
  const page = graph.getPages()[0].id
  const button = graph.createNode('COMPONENT', page, {
    width: 80,
    height: 24,
    componentPropertyDefinitions: [{ id: 'label', name: 'Label', type: 'TEXT', defaultValue: 'Go' }]
  })
  const text = graph.createNode('TEXT', button.id, {
    text: 'Go',
    width: 20,
    height: 16,
    textAutoResize: 'WIDTH_AND_HEIGHT',
    derivedLayout: { width: 20, height: 16 }
  })
  const instance = expectDefined(graph.createInstance(button.id, page))
  graph.updateNode(instance.id, { componentPropertyAssignments: { label: 'Checkout' } })
  const [copy] = graph.getChildren(instance.id)
  // The sizes Figma saved for the texts the component and the copy showed.
  graph.updateNode(copy.id, { derivedLayout: { width: 22, height: 16 } })

  graph.updateNode(text.id, {
    componentPropertyReferences: [{ propertyId: 'label', field: 'TEXT' }]
  })
  graph.syncInstances(button.id)
  expect([copy.text, copy.derivedLayout]).toEqual(['Checkout', null])
})
