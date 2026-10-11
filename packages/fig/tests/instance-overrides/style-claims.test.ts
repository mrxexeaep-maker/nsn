import { expect, test } from 'bun:test'

import { guid } from '#fig-tests/helpers/guid'
import { materializeComponentClosure } from '#fig/instance-overrides/component-closure'
import { interpretInstance } from '#fig/instance-overrides/interpret'
import { materializeInstance } from '#fig/instance-overrides/materialize-instance'
import { mapInstanceSourceChildren } from '#fig/instance-overrides/source-children'

import type { NodeChange } from '@open-pencil/kiwi/fig/codec'
import { SceneGraph } from '@open-pencil/scene-graph'

test('style claims read from a file survive edits to the component, as in Figma', () => {
  const changes: NodeChange[] = [
    { guid: guid(1, 4), type: 'SYMBOL' },
    {
      guid: guid(2, 4),
      type: 'RECTANGLE',
      parentIndex: { guid: guid(1, 4), position: '!' },
      cornerRadius: 2,
      strokeWeight: 1
    },
    {
      guid: guid(3, 4),
      type: 'TEXT',
      parentIndex: { guid: guid(1, 4), position: '"' },
      textData: { characters: 'Label' },
      fontName: { family: 'Inter', style: 'Regular', postscript: '' },
      lineHeight: { value: 20, units: 'PIXELS' }
    },
    {
      guid: guid(4, 4),
      type: 'INSTANCE',
      symbolData: {
        symbolID: guid(1, 4),
        symbolOverrides: [
          { guidPath: { guids: [guid(2, 4)] }, cornerRadius: 12, strokeWeight: 3 },
          {
            guidPath: { guids: [guid(3, 4)] },
            fontName: { family: 'Inter', style: 'Bold', postscript: '' },
            lineHeight: { value: 32, units: 'PIXELS' }
          }
        ]
      }
    } as NodeChange
  ]
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const occurrence = interpretInstance(changes, '4:4')
  const closure = materializeComponentClosure(graph, page.id, changes, occurrence)
  const ids = new Map([...closure].map(([id, value]) => [id, value.materialized.root.id]))
  const result = materializeInstance(graph, page.id, occurrence, ids, {
    sourceChildren: mapInstanceSourceChildren(occurrence, closure)
  })
  const component = closure.get('4:1')
  if (!component) throw new Error('Missing component')
  const [rect, text] = graph.getChildren(component.materialized.root.id)
  graph.updateNode(rect.id, { cornerRadius: 4, strokeWeight: 2, strokeAlign: 'OUTSIDE' })
  graph.updateNode(text.id, { fontWeight: 300, lineHeight: 24, letterSpacing: 1 })
  graph.syncInstances(component.materialized.root.id)

  const [copyRect, copyText] = graph.getChildren(result.root.id)
  expect([copyRect.cornerRadius, copyRect.strokeWeight, copyRect.strokeAlign]).toEqual([
    12,
    3,
    'OUTSIDE'
  ])
  expect([copyText.fontWeight, copyText.lineHeight, copyText.letterSpacing]).toEqual([700, 32, 1])
})
