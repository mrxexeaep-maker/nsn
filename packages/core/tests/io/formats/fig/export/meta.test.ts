import { describe, expect, setDefaultTimeout, test } from 'bun:test'

import { expectDefined } from '#core-tests/helpers/assert'
import * as v from 'valibot'

import { FigmaAPI } from '@open-pencil/core/figma-api'
import { exportFigFile, parseFigFile } from '@open-pencil/core/io'
import { parseFigBuffer } from '@open-pencil/fig'
import { SceneGraph } from '@open-pencil/scene-graph'

setDefaultTimeout(60_000)

// The keys Figma's "Save local copy…" writes, and only those.
const FigMetaJSON = v.pipe(
  v.string(),
  v.parseJson(),
  v.strictObject({
    client_meta: v.strictObject({
      background_color: v.strictObject({
        r: v.number(),
        g: v.number(),
        b: v.number(),
        a: v.number()
      }),
      thumbnail_size: v.strictObject({ width: v.number(), height: v.number() }),
      render_coordinates: v.strictObject({
        x: v.number(),
        y: v.number(),
        width: v.number(),
        height: v.number()
      })
    }),
    file_name: v.string(),
    developer_related_links: v.array(v.unknown()),
    exported_at: v.pipe(v.string(), v.isoTimestamp())
  })
)

// The float32 values the canvas record stores for rgb(0.2, 0.4, 0.6).
const BLUE_GRAY = { r: 0.20000000298023224, g: 0.4000000059604645, b: 0.6000000238418579, a: 1 }

function landingPage() {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  graph.createNode('RECTANGLE', page.id, { name: 'Card', x: 49, y: 3, width: 345, height: 308 })
  new FigmaAPI(graph).currentPage.backgrounds = [
    { type: 'SOLID', color: { r: 0.2, g: 0.4, b: 0.6 }, opacity: 1, visible: true }
  ]
  return { graph, pageId: page.id }
}

function readArchive(bytes: Uint8Array) {
  const parsed = parseFigBuffer(bytes.slice().buffer)
  const meta = v.safeParse(FigMetaJSON, parsed.metaJSON)
  if (!meta.success) throw new Error(`meta.json: ${v.summarize(meta.issues)}`)
  const png = expectDefined(parsed.thumbnailPNG, 'thumbnail.png')
  const dimensions = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return {
    raw: parsed.metaJSON,
    meta: meta.output,
    thumbnailSize: { width: dimensions.getUint32(16), height: dimensions.getUint32(20) }
  }
}

describe('.fig meta.json', () => {
  test('records the document name, page background, and the thumbnail it rendered', async () => {
    const { graph, pageId } = landingPage()
    const { meta, thumbnailSize } = readArchive(
      await exportFigFile(graph, undefined, undefined, pageId, true, 'Landing')
    )

    expect(meta.file_name).toBe('Landing')
    expect(meta.developer_related_links).toEqual([])
    expect(meta.client_meta.background_color).toEqual(BLUE_GRAY)
    expect(meta.client_meta.thumbnail_size).toEqual(thumbnailSize)
    expect(thumbnailSize.width).toBeGreaterThan(1)
    expect(meta.client_meta.render_coordinates).toEqual({ x: 49, y: 3, width: 345, height: 308 })
  })

  test('describes the placeholder when no thumbnail was rendered', async () => {
    const { graph } = landingPage()
    const { meta, thumbnailSize } = readArchive(await exportFigFile(graph))

    expect(meta.file_name).toBe('Untitled')
    expect(meta.client_meta.thumbnail_size).toEqual(thumbnailSize)
    expect(meta.client_meta.render_coordinates).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  test('a reopened file keeps its meta.json until an edit writes a new one', async () => {
    const { graph, pageId } = landingPage()
    const saved = await exportFigFile(graph, undefined, undefined, pageId, true, 'Landing')
    const reopened = await parseFigFile(saved.slice().buffer, { populate: 'first-page' })
    const reopenedPageId = reopened.getPages()[0].id

    expect(readArchive(await exportFigFile(reopened)).raw).toBe(readArchive(saved).raw)

    const [card] = reopened.getChildren(reopenedPageId)
    reopened.updateNode(card.id, { name: 'Edited card' })
    const { meta, thumbnailSize } = readArchive(
      await exportFigFile(reopened, undefined, undefined, reopenedPageId, true, 'Landing v2')
    )

    expect(meta.file_name).toBe('Landing v2')
    expect(meta.client_meta.background_color).toEqual(BLUE_GRAY)
    expect(meta.client_meta.thumbnail_size).toEqual(thumbnailSize)
    expect(meta.client_meta.render_coordinates).toEqual({ x: 49, y: 3, width: 345, height: 308 })
  })
})
