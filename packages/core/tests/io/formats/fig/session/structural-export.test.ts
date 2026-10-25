import { expect, test } from 'bun:test'

import { exportFigFile, parseFigFile } from '@open-pencil/core/io/formats/fig'
import { createFigDocumentSession } from '@open-pencil/fig'
import { initCodec } from '@open-pencil/kiwi/fig/codec'
import { SceneGraph } from '@open-pencil/scene-graph'

import { readerCheckpoint, registerReaderSession } from '#core/kiwi/fig/session/document-state'
import { openReaderSession } from '#core/kiwi/fig/session/reader'

async function sessionWithComponent() {
  await initCodec()
  const source = new SceneGraph()
  const component = source.createNode('COMPONENT', source.getPages()[0].id, { name: 'Component' })
  source.createNode('RECTANGLE', component.id, { name: 'Delete me' })
  const bytes = await exportFigFile(source)
  return openReaderSession(bytes.slice().buffer, 'all')
}

test('loaded structural component edits can be checkpointed and exported', async () => {
  const session = await sessionWithComponent()
  const component = [...session.graph.getAllNodes()].find((node) => node.name === 'Component')
  if (!component) throw new Error('Missing component')
  session.graph.deleteNode(session.graph.getChildren(component.id)[0].id)
  expect(() => session.checkpoint()).not.toThrow()
  expect(await exportFigFile(session.graph)).toBeInstanceOf(Uint8Array)
})

test.each(['RECTANGLE', 'FRAME'] as const)(
  'a deleted component %s stays deleted after repeated session recovery and export',
  async (type) => {
    await initCodec()
    const source = new SceneGraph()
    const component = source.createNode('COMPONENT', source.getPages()[0].id, {
      name: 'Component'
    })
    source.createNode('RECTANGLE', component.id, { name: 'Keep', width: 42 })
    const removed = source.createNode(type, component.id, { name: 'Delete me' })
    if (type === 'FRAME') source.createNode('RECTANGLE', removed.id, { name: 'Nested child' })
    const secondPage = source.addPage('Second')
    source.createNode('RECTANGLE', secondPage.id, { name: 'Other page' })
    source.createInstance(component.id, secondPage.id, { name: 'Lazy instance' })
    const bytes = (await exportFigFile(source)).slice().buffer
    const graph = await parseFigFile(bytes, { populate: 'first-page' })
    const initialCheckpoint = readerCheckpoint(graph)
    if (!initialCheckpoint) throw new Error('Missing reader checkpoint')
    let checkpoint = initialCheckpoint
    const child = [...graph.getAllNodes()].find((node) => node.name === 'Delete me')
    if (!child) throw new Error('Missing component child')
    graph.deleteNode(child.id)

    for (let attempt = 0; attempt < 2; attempt++) {
      const session = createFigDocumentSession(bytes, {}, { graph, checkpoint })
      checkpoint = session.checkpoint()
      registerReaderSession(bytes, session)
      expect(graph.getNode(child.id)).toBeUndefined()
    }
    const reopened = await parseFigFile((await exportFigFile(graph)).slice().buffer)
    const savedComponent = [...reopened.getAllNodes()].find((node) => node.name === 'Component')
    if (!savedComponent) throw new Error('Missing saved component')
    expect(reopened.getChildren(savedComponent.id).map((node) => node.name)).toEqual(['Keep'])
    expect(reopened.getChildren(savedComponent.id)[0].width).toBe(42)
    const instance = [...reopened.getAllNodes()].find((node) => node.name === 'Lazy instance')
    if (!instance) throw new Error('Missing saved instance')
    expect(reopened.getChildren(instance.id).map((node) => node.name)).toEqual(['Keep'])
    expect([...reopened.getAllNodes()].some((node) => node.name === 'Other page')).toBe(true)
    expect([...reopened.getAllNodes()].some((node) => node.name === 'Nested child')).toBe(false)
  }
)
