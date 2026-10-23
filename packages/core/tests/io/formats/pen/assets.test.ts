import { describe, expect, test } from 'bun:test'
import { toUint8Array } from 'js-base64'

import type { IconData, IconProvider } from '@open-pencil/core/icons'
import { IORegistry, penFormat } from '@open-pencil/core/io'
import { parseSVGPath } from '@open-pencil/scene-graph/parse-path'

// A 2 × 1 PNG.
const PNG = toUint8Array(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADElEQVR4nGP8zwACAAYIAQFazwZIAAAAAElFTkSuQmCC'
)

function iconProvider(available: string[], requested: string[][]): IconProvider {
  const glyph = (name: string, size: number): IconData => {
    const [prefix = '', iconName = ''] = name.split(':')
    return {
      prefix,
      name: iconName,
      width: size,
      height: size,
      paths: [
        {
          vectorNetwork: parseSVGPath(`M0 0H${size}V${size}Z`),
          fill: 'currentColor',
          stroke: null,
          strokeWidth: 0,
          strokeCap: 'butt',
          strokeJoin: 'miter'
        }
      ]
    }
  }
  return {
    async icons(names, size) {
      requested.push([...names])
      return new Map(names.filter((name) => available.includes(name)).map((name) => [name, glyph(name, size)]))
    },
    search: () => Promise.resolve({ icons: [], total: 0, collections: {} }),
    previews: () => Promise.resolve(new Map()),
    collections: () => Promise.resolve([]),
    browse: () => Promise.resolve([])
  }
}

const io = new IORegistry([penFormat])

function penBytes(children: unknown[]) {
  return new TextEncoder().encode(JSON.stringify({ version: '2.21', children }))
}

describe('penFormat.readDocument — assets', () => {
  test('draws icons from the provider, falling back to the filled Material Symbol', async () => {
    const requested: string[][] = []
    const icons = iconProvider(['material-symbols:home'], requested)
    const { graph } = await io.readDocument(
      {
        name: 'icons.pen',
        data: penBytes([
          { id: 'home', type: 'icon', library: 'Material Symbols Outlined', icon: 'home', width: 48, height: 48, fill: '#222222' }
        ])
      },
      { icons }
    )
    expect(requested).toEqual([['material-symbols:home-outline', 'material-symbols:home']])
    const glyphs = graph.getChildren('home')
    expect(glyphs).toHaveLength(1)
    expect(glyphs[0]?.width).toBe(48)
  })

  test('reads image files through the host and leaves unreadable ones unpainted', async () => {
    const asked: string[] = []
    const { graph } = await io.readDocument(
      {
        name: 'images.pen',
        data: penBytes([
          { id: 'photo', type: 'rectangle', width: 20, height: 10, fill: { type: 'image', url: './photo.png' } },
          { id: 'gone', type: 'rectangle', width: 20, height: 10, fill: { type: 'image', url: './gone.png' } }
        ]),
        readAsset: async (path) => {
          asked.push(path)
          return path === './photo.png' ? PNG : null
        }
      },
      { icons: iconProvider([], []) }
    )
    expect([...asked].sort()).toEqual(['./gone.png', './photo.png'])
    expect(graph.getNode('photo')?.fills[0]?.type).toBe('IMAGE')
    expect(graph.getNode('gone')?.fills).toEqual([])
  })
})
