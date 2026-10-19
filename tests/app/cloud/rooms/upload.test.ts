import { describe, expect, test } from 'bun:test'

import { shareRoomUploads } from '@/app/cloud/rooms/upload'
import type { CollabAction, CollabActionReceiver } from '@/app/collab/transport/types'

/** A room of tabs whose channel delivers to everyone else, or to one tab when named. */
function room() {
  const receivers = new Map<string, CollabActionReceiver>()
  const tab = (peerId: string): CollabAction => [
    (data, target) => {
      for (const [other, receive] of receivers) {
        if (other !== peerId && (!target || target === other)) receive(data, peerId)
      }
    },
    (handler) => {
      receivers.set(peerId, handler)
    }
  ]
  return { tab }
}

describe('room uploads', () => {
  test('the saver uploads itself; anyone else hears back from the saver', async () => {
    const { tab } = room()
    const calls: string[] = []
    const saver = shareRoomUploads(tab('saver'), {
      saving: () => true,
      upload: async () => {
        calls.push('saver')
        return true
      }
    })
    const other = shareRoomUploads(tab('other'), {
      saving: () => false,
      upload: async () => {
        calls.push('other')
        return true
      }
    })
    expect(await saver.upload()).toBe(true)
    expect(await other.upload()).toBe(true)
    expect(calls).toEqual(['saver', 'saver'])
  })

  test('a failed upload, or none at all, says the document is not there', async () => {
    const failing = room()
    shareRoomUploads(failing.tab('saver'), {
      saving: () => true,
      upload: () => Promise.reject(new Error('Offline'))
    })
    const asking = shareRoomUploads(failing.tab('other'), {
      saving: () => false,
      upload: async () => true
    })
    expect(await asking.upload()).toBe(false)

    const empty = room()
    const alone = shareRoomUploads(empty.tab('other'), {
      saving: () => false,
      upload: async () => true,
      timeoutMs: 10
    })
    expect(await alone.upload()).toBe(false)
  })

  test('leaving the room ends what this tab was waiting for', async () => {
    const { tab } = room()
    const uploads = shareRoomUploads(tab('other'), {
      saving: () => false,
      upload: async () => true
    })
    const waiting = uploads.upload()
    uploads.stop()
    expect(await waiting).toBe(false)
  })
})
