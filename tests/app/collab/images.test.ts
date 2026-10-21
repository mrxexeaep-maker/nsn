import { describe, expect, test } from 'bun:test'

import * as Y from 'yjs'

import { bindRoomImages, type RoomImageStore } from '@/app/collab/images'
import type { EditorStore } from '@/app/editor/active-store'

import { asDouble } from '#tests/helpers/doubles'

/** A store that keeps images by a reference of its own, counting what it was asked. */
function memoryImageStore(canStore = true, failStoring = false) {
  const kept = new Map<string, Uint8Array>()
  const calls = { stored: 0, loaded: 0 }
  const store: RoomImageStore = {
    canStore,
    async store(images) {
      calls.stored++
      if (failStoring) throw new Error('Storage is down')
      return new Map(
        images.map((image) => {
          const ref = `ref:${image.name}`
          kept.set(ref, image.bytes)
          return [image.name, ref]
        })
      )
    },
    async load(refs) {
      calls.loaded++
      return new Map(
        refs.flatMap(({ name, ref }) => {
          const bytes = kept.get(ref)
          return bytes ? [[name, bytes] as const] : []
        })
      )
    }
  }
  return { store, kept, calls }
}

/** A peer of a room: its document and the images its editor holds. */
function peer(images: RoomImageStore) {
  const ydoc = new Y.Doc()
  const graphImages = new Map<string, Uint8Array>()
  let renders = 0
  const reports: string[] = []
  const editor = asDouble<EditorStore>({
    graph: { images: graphImages },
    requestRender: () => {
      renders++
    }
  })
  const bound = bindRoomImages({
    ydoc,
    yimages: ydoc.getMap<Uint8Array>('images'),
    yrefs: ydoc.getMap<string>('imageRefs'),
    store: editor,
    images,
    report: (message) => {
      reports.push(message)
    }
  })
  return { ydoc, graphImages, bound, reports, renders: () => renders }
}

/** Lets queued stores and loads finish. */
async function settle() {
  for (let index = 0; index < 10; index++) await Promise.resolve()
}

/** Sends everything `from` has that `to` lacks, as the relay would. */
function sync(from: Y.Doc, to: Y.Doc) {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)))
}

const photo = new Uint8Array([137, 80, 78, 71, 1, 2, 3])

describe('room images', () => {
  test('a peer that may store an image names it by reference instead of sending its bytes', async () => {
    const images = memoryImageStore()
    const editor = peer(images.store)
    expect(editor.bound.share('a1', photo)).toBe(true)
    await settle()
    expect(editor.ydoc.getMap<string>('imageRefs').get('a1')).toBe('ref:a1')
    expect(editor.ydoc.getMap('images').has('a1')).toBe(false)

    // Another peer loads it from the reference.
    const loader = peer(images.store)
    sync(editor.ydoc, loader.ydoc)
    await settle()
    expect(loader.graphImages.get('a1')).toEqual(photo)
    expect(loader.renders()).toBeGreaterThan(0)
  })

  test('bytes a guest puts in the room are stored and swapped for a reference', async () => {
    const images = memoryImageStore()
    const guest = peer(memoryImageStore(false).store)
    expect(guest.bound.share('g1', photo)).toBe(false)
    guest.ydoc.getMap<Uint8Array>('images').set('g1', photo)

    const editor = peer(images.store)
    sync(guest.ydoc, editor.ydoc)
    await settle()
    expect(editor.ydoc.getMap<string>('imageRefs').get('g1')).toBe('ref:g1')
    expect(editor.ydoc.getMap('images').has('g1')).toBe(false)
    expect(images.calls.stored).toBe(1)
  })

  test('an image the store refused stays in the room as bytes', async () => {
    const editor = peer(memoryImageStore(true, true).store)
    editor.bound.share('a1', photo)
    await settle()
    expect(editor.ydoc.getMap<Uint8Array>('images').get('a1')).toEqual(photo)
    expect(editor.ydoc.getMap('imageRefs').has('a1')).toBe(false)
    expect(editor.reports).toHaveLength(1)
  })
})
