import type { CloudDatabase } from '#cloud/server/db'
import { historyStart, LIMITED_HISTORY_DAYS } from '#cloud/server/documents/versions/history'
import type { ObjectStore } from '#cloud/server/objects'
import type { CloudPolicyContext } from '#cloud/server/policy/keys'
import type { CloudPolicy } from '#cloud/server/policy/policy'
import { groupBy, sumBy, uniq } from 'es-toolkit'
import type { Kysely, Transaction } from 'kysely'

/** How long a save between versions is kept before compaction may delete it. */
export const REVISION_COMPACTION_GRACE_MS = 24 * 60 * 60_000

export type RevisionCompactionOptions = {
  batchSize: number
  /** How long a save stays before it can be compacted, so recent work is never lost to it. */
  graceMs: number
  now?: Date
}

export type RevisionCompactionResult = {
  versionsPruned: number
  revisionsDeleted: number
  objectsDeleted: number
  bytesReclaimed: number
  failed: number
}

export type RevisionCompactionService = {
  compactRevisions(options: RevisionCompactionOptions): Promise<RevisionCompactionResult>
}

/**
 * Keeps a document's stored history to its versions. A save that is neither the document's
 * current state nor kept by a version is deleted once it is older than the grace period, and its
 * file with it when nothing else uses it; a workspace without full history first loses the
 * versions older than its 30 days.
 */
export function createRevisionCompactionService(
  database: Kysely<CloudDatabase>,
  objects: ObjectStore,
  options: { policy?: CloudPolicy; deploymentMode?: CloudPolicyContext['deploymentMode'] } = {}
): RevisionCompactionService {
  const deploymentMode = options.deploymentMode ?? 'self-hosted'
  async function pruneVersions(now: Date, batchSize: number): Promise<number> {
    if (!options.policy) return 0
    const limitedBefore = new Date(now.getTime() - LIMITED_HISTORY_DAYS * 24 * 60 * 60_000)
    const workspaces = await database
      .selectFrom('documentVersion')
      .innerJoin('document', 'document.id', 'documentVersion.documentId')
      .select('document.workspaceId')
      .distinct()
      .where('documentVersion.createdAt', '<', limitedBefore)
      .execute()
    let pruned = 0
    for (const { workspaceId } of workspaces) {
      const start = await historyStart(options.policy, deploymentMode, workspaceId, now)
      if (!start) continue
      const deleted = await database
        .deleteFrom('documentVersion')
        .where('id', 'in', (query) =>
          query
            .selectFrom('documentVersion as version')
            .innerJoin('document', 'document.id', 'version.documentId')
            .select('version.id')
            .where('document.workspaceId', '=', workspaceId)
            .where('version.createdAt', '<', start)
            // The document's current state stays listed however old it is.
            .whereRef('version.revisionId', '!=', 'document.currentRevisionId')
            .limit(batchSize)
        )
        .executeTakeFirst()
      pruned += Number(deleted.numDeletedRows)
    }
    return pruned
  }

  /** Saves that may go: old, unversioned, not current, in a document that is not deleted. */
  function compactable(source: Kysely<CloudDatabase> | Transaction<CloudDatabase>, before: Date) {
    return source
      .selectFrom('documentRevision')
      .innerJoin('document', 'document.id', 'documentRevision.documentId')
      .where('documentRevision.createdAt', '<', before)
      .where('document.deletedAt', 'is', null)
      .where((expression) =>
        expression.or([
          expression('document.currentRevisionId', 'is', null),
          expression('document.currentRevisionId', '!=', expression.ref('documentRevision.id'))
        ])
      )
      .where((expression) =>
        expression.not(
          expression.exists(
            expression
              .selectFrom('documentVersion')
              .select('documentVersion.id')
              .whereRef('documentVersion.revisionId', '=', 'documentRevision.id')
          )
        )
      )
  }

  async function compactDocument(documentId: string, workspaceId: string, before: Date) {
    return database.transaction().execute(async (transaction) => {
      // Saves and restores lock the document too, so none can keep a revision deleted here.
      await transaction
        .selectFrom('document')
        .select('id')
        .where('id', '=', documentId)
        .forUpdate()
        .executeTakeFirst()
      const revisions = await compactable(transaction, before)
        .select(['documentRevision.id', 'documentRevision.storageObjectId'])
        .where('documentRevision.documentId', '=', documentId)
        .execute()
      if (revisions.length === 0) return { revisions: 0, keys: [], bytes: 0 }
      await transaction
        .deleteFrom('documentRevision')
        .where(
          'id',
          'in',
          revisions.map((revision) => revision.id)
        )
        .execute()
      const freed = await transaction
        .deleteFrom('storageObject')
        .where('id', 'in', uniq(revisions.map((revision) => revision.storageObjectId)))
        .where((expression) =>
          expression.not(
            expression.exists(
              expression
                .selectFrom('documentRevision')
                .select('documentRevision.id')
                .whereRef('documentRevision.storageObjectId', '=', 'storageObject.id')
            )
          )
        )
        .returning(['objectKey', 'byteSize'])
        .execute()
      const bytes = sumBy(freed, (object) => Number(object.byteSize))
      if (bytes > 0) {
        await transaction
          .updateTable('workspaceStorageUsage')
          .set({
            committedBytes: (expression) => expression('committedBytes', '-', bytes),
            updatedAt: new Date()
          })
          .where('workspaceId', '=', workspaceId)
          .execute()
      }
      return { revisions: revisions.length, keys: freed.map((object) => object.objectKey), bytes }
    })
  }

  return {
    async compactRevisions(input) {
      const now = input.now ?? new Date()
      const before = new Date(now.getTime() - input.graceMs)
      const result: RevisionCompactionResult = {
        versionsPruned: await pruneVersions(now, input.batchSize),
        revisionsDeleted: 0,
        objectsDeleted: 0,
        bytesReclaimed: 0,
        failed: 0
      }
      const candidates = await compactable(database, before)
        .select(['documentRevision.documentId', 'document.workspaceId'])
        .limit(input.batchSize)
        .execute()
      for (const [documentId, rows] of Object.entries(
        groupBy(candidates, (row) => row.documentId)
      )) {
        const workspaceId = rows[0]?.workspaceId
        if (!workspaceId) continue
        try {
          const compacted = await compactDocument(documentId, workspaceId, before)
          result.revisionsDeleted += compacted.revisions
          result.bytesReclaimed += compacted.bytes
          // Files go once nothing refers to them; one that fails to go is only unused space.
          for (const key of compacted.keys) {
            try {
              await objects.delete(key)
              result.objectsDeleted++
            } catch {
              result.failed++
            }
          }
        } catch {
          result.failed++
        }
      }
      return result
    }
  }
}
