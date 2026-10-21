import { groupBy } from 'es-toolkit'

import type { CloudAPIClient } from '@open-pencil/cloud/client'
import type { DocumentImageLink, ResolveDocumentShareInput } from '@open-pencil/cloud/contract'

import type { RoomImageStore } from '@/app/collab/images'
import { cloudChecksum, downloadCloudImage } from '@/app/integrations/storage/cloud/download'
import { uploadCloudImages } from '@/app/integrations/storage/cloud/images'
import { storageFetch } from '@/app/integrations/storage/s3/fetch'

/** The bytes of each reference, downloaded once per checksum however many names share it. */
async function loadLinked(
  refs: readonly { name: string; ref: string }[],
  links: (checksums: string[]) => Promise<DocumentImageLink[]>
): Promise<ReadonlyMap<string, Uint8Array>> {
  const byChecksum = groupBy(refs, (ref) => ref.ref)
  const loaded = new Map<string, Uint8Array>()
  for (const link of await links(Object.keys(byChecksum))) {
    const bytes = await downloadCloudImage(link, storageFetch)
    for (const ref of byChecksum[link.checksum] ?? []) loaded.set(ref.name, bytes)
  }
  return loaded
}

/**
 * A Cloud room's images, kept in the document's workspace under their SHA-256: an editor stores
 * what it adds, and everyone with access loads what the room names.
 */
export function cloudRoomImages(
  client: Pick<CloudAPIClient, 'requestImageUploads' | 'commitImageUploads' | 'getImageLinks'>,
  documentId: string,
  canStore: boolean
): RoomImageStore {
  return {
    canStore,
    async store(images) {
      const named = await Promise.all(
        images.map(async (image) => ({ ...image, checksum: await cloudChecksum(image.bytes) }))
      )
      await uploadCloudImages({
        cloud: client,
        documentId,
        images: named,
        objectFetch: storageFetch
      })
      return new Map(named.map((image) => [image.name, image.checksum]))
    },
    load: (refs) => loadLinked(refs, (checksums) => client.getImageLinks(documentId, checksums))
  }
}

/** A guest's view of a shared Cloud room's images: it loads what the room names and stores none. */
export function sharedCloudRoomImages(
  client: Pick<CloudAPIClient, 'getSharedImageLinks'>,
  shareId: string,
  share: ResolveDocumentShareInput
): RoomImageStore {
  return {
    canStore: false,
    store: async () => new Map(),
    load: (refs) =>
      loadLinked(refs, (checksums) => client.getSharedImageLinks(shareId, share, checksums))
  }
}
