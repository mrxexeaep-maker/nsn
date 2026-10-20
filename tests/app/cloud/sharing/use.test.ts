import { describe, expect, test } from 'bun:test'

import { shallowRef } from 'vue'

import type { CloudAPIClient } from '@open-pencil/cloud/client'

import type { cloudShareTarget } from '@/app/cloud/sharing/document'
import { useCloudSharing } from '@/app/cloud/sharing/use'
import { createDeferred } from '@/app/runtime/deferred'

import { asDouble } from '#tests/helpers/doubles'

type ShareTarget = NonNullable<ReturnType<typeof cloudShareTarget>>

type Access = Awaited<ReturnType<CloudAPIClient['getDocumentAccess']>>

/** A document on a server that answers with `client`. */
function document(documentId: string, client: Partial<CloudAPIClient>, serverId = 'studio') {
  return asDouble<ShareTarget>({
    documentId,
    workspaceId: null,
    accountId: 'ada',
    server: { id: serverId },
    client
  })
}

/** Access for someone who may not manage sharing, so a read needs nothing else. */
const closed = asDouble<Access>({ canManageSharing: false })

describe('a Cloud document’s sharing', () => {
  test('drops a read that finishes after another document took its place', async () => {
    const slow = createDeferred<Access>()
    const target = shallowRef<ShareTarget | null>(
      document('first', { getDocumentAccess: () => slow.promise })
    )
    const sharing = useCloudSharing(target)
    const reading = sharing.refresh()
    target.value = document('second', { getDocumentAccess: async () => closed })
    slow.resolve(closed)
    expect(await reading).toBe(true)
    expect(sharing.sharing.value).toBeNull()
  })

  test('forgets what it showed when the same document id belongs to another server', async () => {
    const target = shallowRef<ShareTarget | null>(
      document('doc', { getDocumentAccess: async () => closed })
    )
    const sharing = useCloudSharing(target)
    await sharing.refresh()
    expect(sharing.sharing.value).not.toBeNull()
    target.value = document('doc', { getDocumentAccess: async () => closed }, 'other server')
    await Promise.resolve()
    expect(sharing.sharing.value).toBeNull()
  })

  test('says a change failed, and still shows what the server kept', async () => {
    let reads = 0
    const target = document('doc', {
      getDocumentAccess: async () => {
        reads += 1
        return closed
      },
      createDocumentInvitation: () => Promise.reject(new Error('Refused'))
    })
    const sharing = useCloudSharing(target)
    expect(await sharing.invite('ada@example.com', 'edit')).toBe(false)
    expect(reads).toBe(1)
    expect(sharing.inviting.value).toBe(false)
    expect(sharing.sharing.value).toMatchObject({ canManage: false })
  })
})
