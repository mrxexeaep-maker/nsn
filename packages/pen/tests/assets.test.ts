import { describe, expect, test } from 'bun:test'

import { toUint8Array } from 'js-base64'

import { iconNames, penAssets, parsePenDocument, type PenNode } from '@open-pencil/pen'
import type { SceneGraph } from '@open-pencil/scene-graph'
import type { Color } from '@open-pencil/scene-graph/primitives'

import { expectDefined, getNodeOrThrow } from './helpers/assert'
import { parseDocument } from './helpers/document'

// A 2 × 1 PNG.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADElEQVR4nGP8zwACAAYIAQFazwZIAAAAAElFTkSuQmCC'

describe('penAssets', () => {
  test('lists icons with their fallbacks and images in the document folder', () => {
    const doc = parsePenDocument(
      JSON.stringify({
        version: '2.21',
        children: [
          { id: 'a', type: 'icon', library: 'lucide', icon: 'heart' },
          { id: 'b', type: 'icon', library: 'Material Symbols Rounded', icon: 'settings' },
          { id: 'c', type: 'rectangle', fill: { type: 'image', url: './photo.png' } },
          { id: 'd', type: 'rectangle', fill: [{ type: 'image', url: '../secret.png' }] },
          { id: 'e', type: 'rectangle', fill: { type: 'image', url: 'https://example.com/a.png' } },
          { id: 'f', type: 'rectangle', fill: { type: 'image', url: '/etc/a.png' } },
          { id: 'g', type: 'ref', ref: 'x', descendants: { inner: { icon: 'star' } } }
        ]
      })
    )
    expect(penAssets(doc)).toEqual({
      icons: [
        'lucide:heart',
        'material-symbols:settings-outline-rounded',
        'material-symbols:settings-rounded',
        'lucide:star',
        'material-symbols:star-outline-rounded',
        'material-symbols:star-rounded'
      ],
      images: ['./photo.png']
    })
  })

  test('maps every pen.dev icon library to Iconify', () => {
    expect(iconNames('feather', 'star')).toEqual(['feather:star'])
    expect(iconNames('phosphor', 'airplane')).toEqual(['ph:airplane'])
    expect(iconNames('Material Symbols Outlined', 'home')).toEqual([
      'material-symbols:home-outline',
      'material-symbols:home'
    ])
    expect(iconNames('unknown', 'home')).toEqual([])
  })
})

describe('parsePenFile — images', () => {
  function fillWith(fill: PenNode['fill']) {
    const graph = parseDocument([{ id: 'shape', type: 'rectangle', width: 200, height: 100, fill }])
    return { graph, fill: getNodeOrThrow(graph, 'shape').fills[0] }
  }

  test.each([
    [undefined, 'FILL'],
    ['cover', 'FILL'],
    ['contain', 'FIT'],
    ['stretch', 'CROP']
  ] as const)('draws mode %s as %s', (mode, expected) => {
    const { graph, fill } = fillWith({ type: 'image', url: `data:image/png;base64,${PNG}`, mode })
    expect(fill).toMatchObject({ type: 'IMAGE', imageScaleMode: expected })
    expect(graph.images.has(expectDefined(fill.imageHash))).toBe(true)
  })

  test('crops, then covers the layer with the crop', () => {
    // The right half of a 2 × 1 image is square, so on a 200 × 100 layer it is cut to its middle.
    const { fill } = fillWith({
      type: 'image',
      url: `data:image/png;base64,${PNG}`,
      transform: [2, 0, 0, 1, -1, 0]
    })
    const window = expectDefined(fill.imageTransform)
    expect(window.m00).toBeCloseTo(0.5)
    expect(window.m02).toBeCloseTo(0.5)
    expect(window.m11).toBeCloseTo(0.5)
    expect(window.m12).toBeCloseTo(0.25)
  })

  test('reads image files the host loaded, and skips the ones it did not', () => {
    const graph = parseDocument(
      [
        {
          id: 'loaded',
          type: 'rectangle',
          fill: [{ type: 'image', url: './a.png', opacity: 0.5 }]
        },
        { id: 'missing', type: 'rectangle', fill: [{ type: 'image', url: './b.png' }, '#FF0000'] }
      ],
      {},
      { images: new Map([['./a.png', toUint8Array(PNG)]]) }
    )
    expect(getNodeOrThrow(graph, 'missing').fills.map((fill) => fill.type)).toEqual(['SOLID'])
    expect(getNodeOrThrow(graph, 'loaded').fills[0]).toMatchObject({ type: 'IMAGE', opacity: 0.5 })
  })
})

describe('parsePenFile — icons', () => {
  function drawn(fields: Partial<PenNode>) {
    const calls: { names: readonly string[]; size: number; color: Color }[] = []
    const icons = {
      draw(
        graph: SceneGraph,
        frameId: string,
        names: readonly string[],
        size: number,
        color: Color
      ) {
        calls.push({ names, size, color })
        graph.createNode('VECTOR', frameId, { width: size, height: size })
        return true
      }
    }
    const graph = parseDocument(
      [
        {
          id: 'icon',
          type: 'icon',
          library: 'lucide',
          icon: 'heart',
          width: 96,
          height: 30,
          fill: '#CC0000',
          ...fields
        }
      ],
      {},
      { icons }
    )
    return { graph, calls, icon: getNodeOrThrow(graph, 'icon') }
  }

  test('draws the glyph in the fill colour, fitted and centred in the box', () => {
    const { graph, calls, icon } = drawn({})
    expect(calls).toEqual([
      { names: ['lucide:heart'], size: 30, color: { r: 0.8, g: 0, b: 0, a: 1 } }
    ])
    expect(icon.fills).toEqual([])
    expect(graph.getChildren('icon').map((glyph) => [glyph.x, glyph.y])).toEqual([[33, 0]])
  })
})
