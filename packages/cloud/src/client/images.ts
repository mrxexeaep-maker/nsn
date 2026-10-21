import {
  documentImageLinkSchema,
  type CommitImageUploadsInput,
  type DocumentImageLink,
  type RequestImageUploadsInput,
  type ResolveDocumentShareInput
} from '#cloud/contract'
import type { CloudAPI, PublicCloudAPI } from '#cloud/server/api'
import type { hc } from 'hono/client'
import * as v from 'valibot'

import { parseResponse, responseBody, type CloudClientDiagnostic } from './response'

/** Where to put an object: one presigned PUT, or the parts of a multipart upload. */
export const objectUploadSchema = v.variant('kind', [
  v.object({
    kind: v.literal('single'),
    url: v.pipe(v.string(), v.url()),
    method: v.literal('PUT'),
    headers: v.record(v.string(), v.string()),
    expiresAt: v.string()
  }),
  v.object({
    kind: v.literal('multipart'),
    uploadId: v.string(),
    partSize: v.pipe(v.number(), v.integer(), v.minValue(1)),
    parts: v.array(
      v.object({
        partNumber: v.pipe(v.number(), v.integer(), v.minValue(1)),
        url: v.pipe(v.string(), v.url()),
        method: v.literal('PUT'),
        headers: v.record(v.string(), v.string())
      })
    ),
    expiresAt: v.string()
  })
])
const imageLinksResponseSchema = v.object({ images: v.array(documentImageLinkSchema) })
const imageUploadsResponseSchema = v.object({
  uploads: v.array(
    v.object({
      checksum: v.string(),
      uploadId: v.pipe(v.string(), v.uuid()),
      upload: objectUploadSchema
    })
  )
})

/** An upload offered for an image the workspace lacks. */
export type CloudImageUpload = v.InferOutput<typeof imageUploadsResponseSchema>['uploads'][number]

/** The images a save uploads apart from the document, and the links a live room loads them by. */
export function createImageRequests(
  client: ReturnType<typeof hc<CloudAPI>>,
  publicClient: ReturnType<typeof hc<PublicCloudAPI>>,
  onDiagnostic?: CloudClientDiagnostic
) {
  return {
    /** Uploads for the images a save will name that the document's workspace lacks. */
    async requestImageUploads(
      documentId: string,
      input: RequestImageUploadsInput
    ): Promise<CloudImageUpload[]> {
      const response = await parseResponse(
        client.documents[':documentId'].images.$post({
          param: { documentId },
          json: input
        }),
        imageUploadsResponseSchema,
        onDiagnostic
      )
      return response.uploads
    },
    /** Commits the image uploads a save asked for, once their bytes are in place. */
    async commitImageUploads(
      documentId: string,
      uploads: CommitImageUploadsInput['uploads']
    ): Promise<void> {
      const response = await client.documents[':documentId'].images.commit.$post({
        param: { documentId },
        json: { uploads }
      })
      await responseBody(response, onDiagnostic)
    },
    /** Links for images a document's live room names. */
    async getImageLinks(documentId: string, checksums: string[]): Promise<DocumentImageLink[]> {
      const response = await parseResponse(
        client.documents[':documentId'].images.links.$post({
          param: { documentId },
          json: { checksums }
        }),
        imageLinksResponseSchema,
        onDiagnostic
      )
      return response.images
    },
    /** Links for images a shared document's live room names, as the share's guest. */
    async getSharedImageLinks(
      shareId: string,
      input: ResolveDocumentShareInput,
      checksums: string[]
    ): Promise<DocumentImageLink[]> {
      const response = await parseResponse(
        publicClient.shares[':shareId'].images.$post({
          param: { shareId },
          json: { ...input, checksums }
        }),
        imageLinksResponseSchema,
        onDiagnostic
      )
      return response.images
    }
  }
}
