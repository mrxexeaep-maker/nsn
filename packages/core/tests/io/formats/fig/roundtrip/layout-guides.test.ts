import { beforeAll, expect, test } from 'bun:test'

import { exportFigFile, initCodec, parseFigFile, SceneGraph } from '@open-pencil/core'
import { FigmaAPI, type FigmaNodeProxy } from '@open-pencil/core/figma-api'

beforeAll(async () => {
  await initCodec()
})

const red = { r: 1, g: 0, b: 0, a: 0.1 }

test('layout guides set from a script or the panel save and reopen in Figma’s shape', async () => {
  const graph = new SceneGraph()
  const figma = new FigmaAPI(graph)
  const frame = figma.createFrame()
  frame.name = 'Guides'
  frame.layoutGrids = [
    {
      pattern: 'COLUMNS',
      alignment: 'STRETCH',
      gutterSize: 20,
      count: 5,
      offset: 0,
      visible: true,
      color: red
    },
    {
      pattern: 'ROWS',
      alignment: 'MIN',
      gutterSize: 8,
      count: 3,
      sectionSize: 40,
      offset: 4,
      visible: true,
      color: red
    },
    { pattern: 'GRID', sectionSize: 10, visible: true, color: red }
  ]
  const reopened = await parseFigFile((await exportFigFile(graph)).slice().buffer)
  const again = new FigmaAPI(reopened)
  const copy = again.currentPage.findOne((node: FigmaNodeProxy) => node.name === 'Guides')
  const shapes = copy?.layoutGrids.map((grid) => ({ ...grid, color: undefined }))
  expect(shapes).toEqual([
    {
      pattern: 'COLUMNS',
      alignment: 'STRETCH',
      gutterSize: 20,
      count: 5,
      offset: 0,
      visible: true,
      color: undefined
    },
    {
      pattern: 'ROWS',
      alignment: 'MIN',
      gutterSize: 8,
      count: 3,
      sectionSize: 40,
      offset: 4,
      visible: true,
      color: undefined
    },
    { pattern: 'GRID', sectionSize: 10, visible: true, color: undefined }
  ])
})
