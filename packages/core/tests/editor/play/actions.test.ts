import { describe, expect, test } from 'bun:test'

import { controlSetPages, createEditor } from '@open-pencil/core/editor'
import { emptyBehaviour } from '@open-pencil/scene-graph'

/**
 * A Switch set on a library page, and on the first page a card holding an instance of its
 * Off variant, as a file whose pages load on visit holds them.
 */
function switchOnAnotherPage() {
  const editor = createEditor()
  const graph = editor.graph
  const pageId = editor.state.currentPageId
  const library = graph.addPage('Library')
  const set = graph.createNode('COMPONENT_SET', library.id, {
    name: 'Switch',
    componentPropertyDefinitions: [
      { id: 'state', name: 'State', type: 'VARIANT', defaultValue: 'Off', variantOptions: ['Off', 'On'] }
    ]
  })
  const off = graph.createNode('COMPONENT', set.id, {
    name: 'State=Off',
    componentPropertyValues: { State: 'Off' }
  })
  graph.createNode('COMPONENT', set.id, { name: 'State=On', componentPropertyValues: { State: 'On' } })
  editor.setBehaviour(set.id, {
    ...emptyBehaviour('switch'),
    booleans: { value: { propertyId: 'state', on: 'On', off: 'Off' } }
  })
  const card = graph.createNode('FRAME', pageId, { name: 'Card' })
  const instance = graph.createInstance(off.id, card.id)
  if (!instance) throw new Error('No instance')
  return { graph, pageId, library }
}

describe('preview and the pages of its controls', () => {
  test('names the pages holding the sets the controls switch between', () => {
    const { graph, pageId, library } = switchOnAnotherPage()
    expect(controlSetPages(graph, pageId)).toEqual([library.id])
    expect(controlSetPages(graph, library.id)).toEqual([])
  })
})
