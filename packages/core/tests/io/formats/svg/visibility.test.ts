import { describe, expect, test } from 'bun:test'

import { FigmaAPI } from '@open-pencil/core/figma-api'
import { createSVGNodes } from '@open-pencil/core/io'
import { SceneGraph } from '@open-pencil/scene-graph'

import { importSVG } from '#core/tools/create/svg'

const ISSUE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <g visibility="hidden"><path d="M0 0 L50 0 L50 50 Z" fill="#ff0000"/></g>
  <g display="none"><path d="M60 0 L90 0 L90 30 Z" fill="#00ff00"/></g>
  <path d="M0 60 L30 60 L30 90 Z" fill="#0000ff"/>
</svg>`

function importedNodes(contents: string, rootAttributes = '') {
  const graph = new SceneGraph()
  const root = createSVGNodes(
    graph,
    graph.getPages()[0].id,
    `<svg viewBox="0 0 100 100" ${rootAttributes}>${contents}</svg>`,
    { keepEmpty: true }
  )
  if (!root) throw new Error('SVG import failed')
  return [...graph.nodes.values()].filter((node) => node.type === 'VECTOR' || node.type === 'TEXT')
}

describe('SVG visibility', () => {
  test('import_svg preserves hidden paths and omits display:none subtrees (#1166)', async () => {
    const graph = new SceneGraph()
    const result = await importSVG.execute(new FigmaAPI(graph), { svg: ISSUE_SVG })
    expect(result).toMatchObject({ type: 'FRAME' })
    const vectors = [...graph.nodes.values()].filter((node) => node.type === 'VECTOR')
    expect(vectors.map((node) => node.visible)).toEqual([false, true])
    expect(vectors.map((node) => node.fills[0]?.color)).toEqual([
      { r: 1, g: 0, b: 0, a: 1 },
      { r: 0, g: 0, b: 1, a: 1 }
    ])
  })

  test.each(['hidden', 'collapse'])(
    'inherits visibility=%s through nested groups',
    (visibility) => {
      const nodes = importedNodes(`<g visibility="${visibility}"><g>
      <rect id="hidden" width="10" height="10"/>
      <g visibility="visible"><circle id="shown" cx="20" cy="20" r="5"/></g>
    </g></g>`)
      expect(nodes.map(({ name, visible }) => ({ name, visible }))).toEqual([
        { name: 'hidden', visible: false },
        { name: 'shown', visible: true }
      ])
    }
  )

  test('display:none cannot be reversed by a descendant', () => {
    expect(
      importedNodes(`<g display="none"><g display="inline" visibility="visible">
      <rect width="10" height="10"/>
    </g></g>`)
    ).toEqual([])
  })

  test('inline styles override presentation attributes on groups and shapes', () => {
    const nodes = importedNodes(`<g visibility="visible" style="visibility: hidden">
      <rect id="hidden" width="10" height="10"/>
      <rect id="shown" x="20" width="10" height="10" visibility="hidden" style="visibility:visible"/>
    </g>
    <g display="inline" style="display: none"><rect width="10" height="10"/></g>
    <rect id="displayed" width="10" height="10" display="none" style="display:inline"/>`)
    expect(nodes.map(({ name, visible }) => ({ name, visible }))).toEqual([
      { name: 'hidden', visible: false },
      { name: 'shown', visible: true },
      { name: 'displayed', visible: true }
    ])
  })

  test('root visibility is inherited but root display:none omits the whole drawing', () => {
    const contents = '<rect width="10" height="10"/>'
    expect(importedNodes(contents, 'visibility="hidden"').map((node) => node.visible)).toEqual([
      false
    ])
    expect(importedNodes(contents, 'display="none"')).toEqual([])
  })

  test('explicit visibility inheritance and initial values resolve at the parent', () => {
    expect(
      importedNodes(`<g visibility="hidden">
      <rect width="10" height="10" visibility="inherit"/>
      <rect width="10" height="10" style="visibility:unset"/>
      <rect width="10" height="10" style="visibility:initial"/>
    </g>`).map((node) => node.visible)
    ).toEqual([false, false, true])
  })

  test('use references inherit visibility and respect display on the referenced shape', () => {
    expect(
      importedNodes(`<defs>
      <rect id="shape" width="10" height="10"/>
      <rect id="absent" width="10" height="10" display="none"/>
    </defs>
    <use href="#shape" visibility="hidden"/>
    <use href="#shape" visibility="visible"/>
    <use href="#absent"/>`).map((node) => node.visible)
    ).toEqual([false, true])
  })

  test('hidden text layers retain their characters, while display:none text is omitted', () => {
    expect(
      importedNodes(`<g visibility="hidden"><text x="0" y="20">Hidden</text></g>
      <text x="0" y="40" display="none">Absent</text>
      <text x="0" y="60">Shown</text>`).map(({ text, visible }) => ({ text, visible }))
    ).toEqual([
      { text: 'Hidden', visible: false },
      { text: 'Shown', visible: true }
    ])
  })

  test('hidden clip geometry still clips, while display:none clip children do not', () => {
    const nodes = importedNodes(`<defs><clipPath id="clip" display="none">
      <rect width="20" height="20" visibility="hidden"/>
      <rect x="30" width="20" height="20" display="none"/>
    </clipPath></defs><rect width="100" height="100" clip-path="url(#clip)"/>`)
    expect(nodes).toHaveLength(2)
    expect(nodes.map(({ width, visible }) => ({ width, visible }))).toEqual([
      { width: 20, visible: true },
      { width: 100, visible: true }
    ])
  })
})
