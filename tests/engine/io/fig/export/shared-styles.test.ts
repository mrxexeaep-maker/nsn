import { beforeAll, describe, expect, test } from 'bun:test'

import { exportFigFile, initCodec, parseFigFile } from '@open-pencil/core'
import { parseFigBuffer } from '@open-pencil/fig'
import { getSharedStyles, SceneGraph } from '@open-pencil/scene-graph'

import { sceneNodeToKiwi } from '#core/kiwi/fig/node-change/serialize'

import { uint8ArrayToArrayBuffer } from '#tests/helpers/fig/fixtures'

function serialize(graph: SceneGraph, nodeId: string) {
  const node = graph.getNode(nodeId)
  if (!node) throw new Error('Expected scene node')
  return sceneNodeToKiwi(node, { sessionID: 1, localID: 1 }, 0, { value: 20 }, graph, [])[0]
}

describe('Figma shared style export', () => {
  beforeAll(async () => {
    await initCodec()
  })
  test('exports every modeled style reference and promoted layout grids', () => {
    const graph = new SceneGraph()
    const page = graph.getPages()[0]
    const node = graph.createNode('FRAME', page.id, {
      fillStyleId: '1:10',
      strokeStyleId: '1:11',
      textStyleId: '1:12',
      effectStyleId: '1:13',
      gridStyleId: '1:14',
      layoutGrids: [{ pattern: 'COLUMNS', count: 12, gutterSize: 16, visible: true }]
    })

    expect(serialize(graph, node.id)).toMatchObject({
      styleIdForFill: { guid: { sessionID: 1, localID: 10 } },
      styleIdForStrokeFill: { guid: { sessionID: 1, localID: 11 } },
      styleIdForText: { guid: { sessionID: 1, localID: 12 } },
      styleIdForEffect: { guid: { sessionID: 1, localID: 13 } },
      styleIdForGrid: { guid: { sessionID: 1, localID: 14 } },
      layoutGrids: [{ pattern: 'COLUMNS', count: 12, gutterSize: 16, visible: true }]
    })
  })

  test('exports internal style definitions with their style type', () => {
    const graph = new SceneGraph()
    const page = graph.getPages()[0]
    const style = graph.createNode('RECTANGLE', page.id, {
      name: 'Brand/Primary',
      sharedStyleType: 'FILL',
      internalOnly: true
    })
    style.source.id = '1:10'

    expect(serialize(graph, style.id)).toMatchObject({
      guid: { sessionID: 1, localID: 10 },
      name: 'Brand/Primary',
      styleType: 'FILL'
    })
  })

  test('includes referenced definitions in a complete .fig export', async () => {
    const graph = new SceneGraph()
    const page = graph.getPages()[0]
    const style = graph.createNode('RECTANGLE', page.id, {
      name: 'Brand/Primary',
      sharedStyleType: 'FILL',
      internalOnly: true
    })
    style.source.id = '1:10'
    graph.createNode('RECTANGLE', page.id, { name: 'Styled target', fillStyleId: '1:10' })

    const bytes = await exportFigFile(graph)
    const parsed = parseFigBuffer(uint8ArrayToArrayBuffer(bytes))
    const definition = parsed.nodeChanges.find((change) => change.styleType === 'FILL')
    const target = parsed.nodeChanges.find((change) => change.name === 'Styled target')

    expect(definition).toMatchObject({ name: 'Brand/Primary', styleType: 'FILL' })
    expect(target?.styleIdForFill).toEqual({ guid: { sessionID: 1, localID: 10 } })
  })

  test('names local styles by the records it writes for them, whatever their ids', async () => {
    const graph = new SceneGraph()
    const page = graph.getPages()[0]
    for (const [name, id, type] of [
      ['Imported', '1:10', 'FILL'],
      ['Tokens', 'style:a1b2c3d4e5f6', 'FILL'],
      ['Heading', 'style:0f9e8d7c6b5a', 'TEXT']
    ] as const) {
      const style = graph.createNode(type === 'TEXT' ? 'TEXT' : 'RECTANGLE', page.id, {
        name,
        sharedStyleType: type,
        internalOnly: true
      })
      style.source.id = id
      graph.createNode(type === 'TEXT' ? 'TEXT' : 'RECTANGLE', page.id, {
        name: `${name} target`,
        ...(type === 'TEXT' ? { textStyleId: id } : { fillStyleId: id })
      })
    }

    const parsed = parseFigBuffer(uint8ArrayToArrayBuffer(await exportFigFile(graph)))
    for (const name of ['Imported', 'Tokens', 'Heading']) {
      const definition = parsed.nodeChanges.find(
        (change) => change.name === name && change.styleType
      )
      const target = parsed.nodeChanges.find((change) => change.name === `${name} target`)
      const reference = target?.styleIdForFill ?? target?.styleIdForText
      expect(definition?.guid).toBeDefined()
      expect(reference?.guid).toEqual(definition?.guid)
    }
  })

  test('reopen layers and ranges with the styles made in OpenPencil they use', async () => {
    const graph = new SceneGraph()
    const page = graph.getPages()[0]
    const fill = graph.createNode('RECTANGLE', page.id, {
      name: 'Brand',
      sharedStyleType: 'FILL',
      internalOnly: true
    })
    fill.source.id = 'style:a1b2c3d4e5f6'
    const heading = graph.createNode('TEXT', page.id, {
      name: 'Heading',
      sharedStyleType: 'TEXT',
      internalOnly: true,
      fontSize: 28
    })
    heading.source.id = 'style:0f9e8d7c6b5a'
    graph.createNode('TEXT', page.id, {
      name: 'Styled',
      text: 'Title body',
      fillStyleId: fill.source.id,
      styleRuns: [{ start: 0, length: 5, style: { textStyleId: heading.source.id, fontSize: 28 } }]
    })

    const reopened = await parseFigFile(uint8ArrayToArrayBuffer(await exportFigFile(graph)))
    const styled = [...reopened.getAllNodes()].find((node) => node.name === 'Styled')
    const named = (kind: 'fill' | 'text', id: string | null | undefined) =>
      getSharedStyles(reopened, kind).find((style) => style.id === id)?.name
    expect(named('fill', styled?.fillStyleId)).toBe('Brand')
    expect(named('text', styled?.styleRuns[0]?.style.textStyleId)).toBe('Heading')
  })

  test('names a library style by its key, as Figma does, on layers and ranges', async () => {
    const graph = new SceneGraph()
    const page = graph.getPages()[0]
    const style = graph.createNode('TEXT', page.id, {
      name: 'LG/Medium',
      sharedStyleType: 'TEXT',
      internalOnly: true
    })
    style.source.id = '1:42'
    style.source.fig.rawNodeFields = { key: 'c98daa82', version: '4169:25' }
    graph.createNode('TEXT', page.id, {
      name: 'Styled',
      text: 'Title body',
      textStyleId: '1:42',
      styleRuns: [{ start: 0, length: 5, style: { textStyleId: '1:42' } }]
    })

    const parsed = parseFigBuffer(uint8ArrayToArrayBuffer(await exportFigFile(graph)))
    const styled = parsed.nodeChanges.find((change) => change.name === 'Styled')
    const library = { assetRef: { key: 'c98daa82', version: '4169:25' } }
    expect(styled?.styleIdForText).toEqual(library)
    expect(styled?.textData?.styleOverrideTable?.[0]?.styleIdForText).toEqual(library)
  })
})
