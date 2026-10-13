import { deflateSync, inflateSync } from 'fflate'
import * as decoding from 'lib0/decoding'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as Y from 'yjs'

import { joinCollabRoom, type JoinCollabRoom } from '@/app/collab/transport'
import type { CollabAction } from '@/app/collab/transport/types'

export type CollabRoomOptions = {
  roomId: string
  ydoc: Y.Doc
  awareness: awarenessProtocol.Awareness
  updatePeersList: () => void
  joinRoom?: JoinCollabRoom
}

export type CollabRoomConnection = {
  room: ReturnType<JoinCollabRoom>
  sendYjsUpdate: (data: Uint8Array, peerId?: string) => void
  sendAwareness: (data: Uint8Array, peerId?: string) => void
  sendSyncStep1: (data: Uint8Array, peerId?: string) => void
  /** What agents preview while they stream, apart from presence (`app/collab/agent-preview.ts`). */
  agentPreview: CollabAction
  /** Follow peers leaving the room; returns the unsubscribe. */
  onPeerLeave: (handler: (peerId: string) => void) => () => void
  /** The peer whose awareness carries a presence client, so media reaches the right person. */
  peerForClient: (clientId: number) => string | undefined
}

type AwarenessEntry = { clientId: number; removed: boolean }

/**
 * What a peer joining needs is the whole document, which repeats the same field names across
 * every layer, so the reply to its state vector travels compressed; Yjs's V2 encoding already
 * groups that repetition, and together they make a room's first sync about a twelfth the size.
 * Edits travel as V2 updates uncompressed: they are small, and arrive in a stream.
 */
function encodeSyncReply(ydoc: Y.Doc, stateVector: Uint8Array): Uint8Array {
  return deflateSync(Y.encodeStateAsUpdateV2(ydoc, stateVector))
}

function applySyncReply(ydoc: Y.Doc, data: Uint8Array): void {
  let update: Uint8Array
  try {
    update = inflateSync(data)
  } catch {
    // A reply that does not inflate came from a build that does not share this room's format.
    return
  }
  Y.applyUpdateV2(ydoc, update, 'remote')
}

function awarenessEntries(data: Uint8Array): AwarenessEntry[] {
  try {
    const decoder = decoding.createDecoder(data)
    const count = decoding.readVarUint(decoder)
    const entries: AwarenessEntry[] = []
    for (let index = 0; index < count; index++) {
      const clientId = decoding.readVarUint(decoder)
      decoding.readVarUint(decoder)
      entries.push({ clientId, removed: decoding.readVarString(decoder) === 'null' })
    }
    return entries
  } catch {
    return []
  }
}

export function connectCollabRoom({
  roomId,
  ydoc,
  awareness,
  updatePeersList,
  joinRoom = joinCollabRoom
}: CollabRoomOptions): CollabRoomConnection {
  const room = joinRoom(roomId)
  const [sendYjsUpdate, getUpdate] = room.makeAction('yjs-update')
  const [sendAwareness, getAwareness] = room.makeAction('awareness')
  const [sendSyncStep1, getSyncStep1] = room.makeAction('sync-step1')
  const [sendSyncReply, getSyncReply] = room.makeAction('sync-reply')
  const agentPreview = room.makeAction('agent-preview')
  // A transport keeps one leave handler, so the connection shares it with its users.
  const leaveHandlers = new Set<(peerId: string) => void>()

  const awarenessClientsByPeer = new Map<string, Set<number>>()

  getUpdate((data) => {
    Y.applyUpdateV2(ydoc, data, 'remote')
  })

  getAwareness((data, peerId) => {
    // A peer also relays removals of clients it timed out, which are not its own.
    const clients = awarenessClientsByPeer.get(peerId) ?? new Set<number>()
    for (const { clientId, removed } of awarenessEntries(data)) {
      if (removed) clients.delete(clientId)
      else clients.add(clientId)
    }
    awarenessClientsByPeer.set(peerId, clients)
    awarenessProtocol.applyAwarenessUpdate(awareness, data, 'remote')
  })

  getSyncStep1((stateVector, peerId) => {
    sendSyncReply(encodeSyncReply(ydoc, stateVector), peerId)
  })

  getSyncReply((data) => {
    applySyncReply(ydoc, data)
  })

  ydoc.on('updateV2', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return
    sendYjsUpdate(update)
  })

  awareness.on(
    'update',
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      if (origin === 'remote' || origin === 'peer-left') return
      const changedClients = [...added, ...updated, ...removed]
      const encodedUpdate = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
      sendAwareness(encodedUpdate)
    }
  )

  room.onPeerJoin((peerId) => {
    sendSyncStep1(Y.encodeStateVector(ydoc), peerId)
    sendAwareness(awarenessProtocol.encodeAwarenessUpdate(awareness, [awareness.clientID]), peerId)
  })

  room.onPeerLeave((peerId) => {
    const remoteClients = [...(awarenessClientsByPeer.get(peerId) ?? [])]
    awarenessClientsByPeer.delete(peerId)
    awarenessProtocol.removeAwarenessStates(awareness, remoteClients, 'peer-left')
    updatePeersList()
    for (const handler of leaveHandlers) handler(peerId)
  })

  return {
    room,
    sendYjsUpdate,
    sendAwareness,
    sendSyncStep1,
    agentPreview,
    onPeerLeave(handler) {
      leaveHandlers.add(handler)
      return () => leaveHandlers.delete(handler)
    },
    peerForClient(clientId) {
      for (const [peerId, clients] of awarenessClientsByPeer) {
        if (clients.has(clientId)) return peerId
      }
      return undefined
    }
  }
}
