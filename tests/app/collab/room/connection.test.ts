import { describe, expect, test } from 'bun:test'

import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'

import { connectCollabRoom } from '@/app/collab/room/connection'
import type { JoinCollabRoom } from '@/app/collab/transport'

import { createMemoryRooms } from '#tests/helpers/collab/memory-transport'

const ROOM = 'dddddddddddddddddddddddddddddddd'

/** Joins through `rooms`, recording the size of every message sent, by action. */
function recordingJoin(rooms: ReturnType<typeof createMemoryRooms>) {
  const sent = new Map<string, number[]>()
  const join: JoinCollabRoom = (roomId) => {
    const room = rooms.join(roomId)
    return {
      ...room,
      makeAction(namespace) {
        const [send, receive] = room.makeAction(namespace)
        return [
          (data, peerId) => {
            sent.set(namespace, [...(sent.get(namespace) ?? []), data.byteLength])
            send(data, peerId)
          },
          receive
        ]
      }
    }
  }
  return { join, sent }
}

function connect(join: JoinCollabRoom) {
  const ydoc = new Y.Doc()
  connectCollabRoom({
    roomId: ROOM,
    ydoc,
    awareness: new Awareness(ydoc),
    updatePeersList: () => undefined,
    joinRoom: join
  })
  return ydoc
}

/** Layers whose fields repeat, as a page's do. */
function fillLayers(ydoc: Y.Doc, count: number) {
  const nodes = ydoc.getMap<Y.Map<unknown>>('nodes')
  ydoc.transact(() => {
    for (let index = 0; index < count; index++) {
      const node = new Y.Map<unknown>()
      node.set('type', 'RECTANGLE')
      node.set('name', `Rectangle ${index}`)
      node.set('x', index * 10)
      node.set('y', 0)
      node.set('fills', [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, visible: true }])
      nodes.set(`0:${index}`, node)
    }
  })
}

describe('collab room connection', () => {
  test("brings a joining peer the room's document compressed, then syncs edits both ways", async () => {
    const rooms = createMemoryRooms()
    const recording = recordingJoin(rooms)
    const host = connect(recording.join)
    fillLayers(host, 200)
    const v1Size = Y.encodeStateAsUpdate(host).byteLength

    const guest = connect(rooms.join)
    await rooms.settle()
    const [reply] = recording.sent.get('sync-reply') ?? []
    expect(reply).toBeLessThan(v1Size / 4)

    const nodes = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>('nodes')
    expect(nodes(guest).size).toBe(200)
    expect(nodes(guest).get('0:199')?.get('name')).toBe('Rectangle 199')

    nodes(guest).get('0:5')?.set('x', 999)
    await rooms.settle()
    expect(nodes(host).get('0:5')?.get('x')).toBe(999)

    nodes(host).get('0:6')?.set('name', 'Renamed')
    await rooms.settle()
    expect(nodes(guest).get('0:6')?.get('name')).toBe('Renamed')
  })

  test('ignores a sync reply that does not inflate', async () => {
    const rooms = createMemoryRooms()
    const ydoc = connect(rooms.join)
    const intruder = rooms.join(ROOM)
    const [sendReply] = intruder.makeAction('sync-reply')
    await rooms.settle()

    sendReply(Y.encodeStateAsUpdate(new Y.Doc()))
    await rooms.settle()
    expect(ydoc.getMap('nodes').size).toBe(0)
  })
})
