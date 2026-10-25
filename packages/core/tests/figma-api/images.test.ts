import { describe, expect, test } from 'bun:test'

import { scriptResult } from '#core-tests/helpers/script'
import { toUint8Array } from 'js-base64'

import { FigmaAPI } from '@open-pencil/core/figma-api'
import { SceneGraph } from '@open-pencil/scene-graph'

// Expected values were recorded by running the same scripts in Figma, except where noted.

/** A 1 × 1 PNG, which Figma stores under the hash below. */
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_1X1_HASH = 'b2bbe763c7e1828c750d53f78550709a6fea19be'
const PNG_3X2 =
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGP4z8AAQQxwFgBB0gX7h/C5SAAAAABJRU5ErkJggg=='
const GIF_1X1 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const WEBP_1X1 = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA='

/** A PNG header declaring a `width` × `height` image, through its bit depth and color type. */
function pngHeader(width: number, height: number): number[] {
  const header = new Uint8Array(26)
  const view = new DataView(header.buffer)
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  view.setUint32(16, width)
  view.setUint32(20, height)
  header.set([8, 0], 24)
  return Array.from(header)
}

/** A script that runs each case's call and gives what it resolved to or the message it threw. */
function attempts(cases: Record<string, string>): string {
  const entries = Object.entries(cases).map(
    ([name, call]) =>
      `[${JSON.stringify(name)}, await (async () => ${call})().then((value) => value, (error) => error.message)]`
  )
  return `
    const bytes = (base64) => figma.base64Decode(base64)
    return Object.fromEntries([${entries.join(',\n')}])
  `
}

describe('figma.createImage', () => {
  test("gives Figma's Image: its hash, copies of its bytes, and its size", async () => {
    expect(
      await scriptResult(`
        const image = figma.createImage(figma.base64Decode('${PNG_1X1}'))
        const edited = await image.getBytesAsync()
        edited[0] = 0
        return {
          hash: image.hash,
          again: figma.createImage(figma.base64Decode('${PNG_1X1}')).hash,
          byHash: figma.getImageByHash(image.hash)?.hash,
          first: (await image.getBytesAsync())[0],
          size: await image.getSizeAsync(),
          png: await figma.createImage(figma.base64Decode('${PNG_3X2}')).getSizeAsync(),
          gif: await figma.createImage(figma.base64Decode('${GIF_1X1}')).getSizeAsync()
        }
      `)
    ).toEqual({
      hash: PNG_1X1_HASH,
      again: PNG_1X1_HASH,
      byHash: PNG_1X1_HASH,
      first: 0x89,
      size: { width: 1, height: 1 },
      png: { width: 3, height: 2 },
      gif: { width: 1, height: 1 }
    })
  })

  test('keeps the bytes it was given when the script changes its array afterwards', async () => {
    expect(
      await scriptResult(`
        const data = figma.base64Decode('${PNG_1X1}')
        const image = figma.createImage(data)
        data[0] = 0
        return (await image.getBytesAsync())[0]
      `)
    ).toBe(0x89)
  })

  test('takes a PNG, JPEG, or GIF up to 4096 pixels a side, and finds only images it stored', async () => {
    const png = (width: number, height: number, length = 26) =>
      `new Uint8Array(${JSON.stringify(pngHeader(width, height).slice(0, length))})`
    expect(
      await scriptResult(
        attempts({
          side4096: `(await figma.createImage(${png(4096, 1)}).getSizeAsync()).width`,
          wide: `figma.createImage(${png(4097, 1)}).hash`,
          tall: `figma.createImage(${png(1, 4097)}).hash`,
          empty: `figma.createImage(${png(0, 0)}).hash`,
          noColorType: `figma.createImage(${png(1, 1, 25)}).hash`,
          webp: `figma.createImage(bytes('${WEBP_1X1}')).hash`,
          junk: 'figma.createImage(new Uint8Array([1, 2, 3])).hash',
          array: 'figma.createImage([1, 2, 3]).hash',
          missing: 'figma.createImage().hash',
          unknownHash: `figma.getImageByHash('${'a'.repeat(40)}')`,
          numberHash: 'figma.getImageByHash(5)'
        })
      )
    ).toEqual({
      side4096: 4096,
      wide: 'in createImage: Image is too large',
      tall: 'in createImage: Image is too large',
      empty: 'in createImage: Image type is unsupported',
      noColorType: 'in createImage: Image type is unsupported',
      webp: 'in createImage: Image type is unsupported',
      junk: 'in createImage: Image type is unsupported',
      array:
        'in createImage: Property "createImage" failed validation: Expected Uint8Array, received array',
      missing: 'in createImage: Property "createImage" failed validation: Required value missing',
      unknownHash: null,
      numberHash:
        'in getImageByHash: Property "getImageByHash" failed validation: Expected string, received number'
    })
  })
})

describe('figma.createImageAsync', () => {
  /** A FigmaAPI whose host answers `fetch` with `respond`, and the URLs the host was asked for. */
  function withHostFetch(respond: (url: string) => Promise<Response>) {
    const requested: string[] = []
    const figma = new FigmaAPI(new SceneGraph(), {
      fetch: (url) => {
        requested.push(url)
        return respond(url)
      }
    })
    return { figma, requested }
  }

  test("loads an HTTP(S) URL through the host's fetch and reads a data URI itself", async () => {
    const { figma, requested } = withHostFetch(
      async () => new Response(new Uint8Array(toUint8Array(PNG_3X2)))
    )
    const result = await scriptResult(
      `
        const image = await figma.createImageAsync('https://example.com/photo.png')
        const node = figma.createRectangle()
        const { width, height } = await image.getSizeAsync()
        node.resize(width, height)
        node.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }]
        const data = await figma.createImageAsync('data:image/png;base64,${PNG_1X1}')
        return {
          size: [node.width, node.height],
          fillIsImage: node.fills[0].imageHash === image.hash,
          sameAsCreateImage: image.hash === figma.createImage(figma.base64Decode('${PNG_3X2}')).hash,
          data: [data.hash, await data.getSizeAsync()]
        }
      `,
      figma
    )

    expect(result).toEqual({
      size: [3, 2],
      fillIsImage: true,
      sameAsCreateImage: true,
      data: [PNG_1X1_HASH, { width: 1, height: 1 }]
    })
    expect(requested).toEqual(['https://example.com/photo.png'])
  })

  test('refuses what Figma refuses and stores nothing', async () => {
    const { figma, requested } = withHostFetch(async (url) => {
      if (url.endsWith('/offline.png')) throw new TypeError('Load failed')
      if (url.endsWith('/page')) return new Response('<html></html>')
      return new Response('Not found', { status: 404 })
    })
    const result = await scriptResult(
      attempts({
        missing: `figma.createImageAsync('https://example.com/missing.png')`,
        offline: `figma.createImageAsync('https://example.com/offline.png')`,
        page: `figma.createImageAsync('https://example.com/page')`,
        relative: `figma.createImageAsync('/photo.png')`,
        file: `figma.createImageAsync('file:///etc/hosts')`,
        ftp: `figma.createImageAsync('ftp://example.com/photo.png')`,
        text: `figma.createImageAsync('data:text/plain,hello')`,
        webp: `figma.createImageAsync('data:image/webp;base64,${WEBP_1X1}')`,
        number: 'figma.createImageAsync(5)'
      }),
      figma
    )

    const absolute = 'createImageAsync requires an absolute URL (http:// or https://) or a data URI'
    expect(result).toEqual({
      // Figma fetches through its own server, which answers 403 for a missing or non-image
      // resource and for a host it cannot reach; a host fetch reports what actually happened.
      missing: 'Unable to fetch image. Response status: 404',
      offline: 'Unable to fetch image: Load failed',
      page: 'Image type is unsupported',
      relative: absolute,
      file: absolute,
      ftp: absolute,
      text: 'Image type is unsupported',
      webp: 'Image type is unsupported',
      number:
        'in createImageAsync: Property "createImageAsync" failed validation: Expected string, received number'
    })
    expect(requested).toEqual([
      'https://example.com/missing.png',
      'https://example.com/offline.png',
      'https://example.com/page'
    ])
    expect(figma.graph.images.size).toBe(0)
  })
})
