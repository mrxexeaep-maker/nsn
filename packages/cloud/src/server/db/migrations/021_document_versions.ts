import { checkColumnIn } from '#cloud/server/db/expressions'
import { sql, type Kysely } from 'kysely'

import { addCurrentTimestampColumns } from './helpers'

/**
 * A document's version history: the revisions kept as checkpoints or named versions. Saves in
 * between are compacted away, so a version is what keeps a revision and its stored file.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable('document_version')
    .addColumn('id', 'uuid', (column) => column.primaryKey())
    .addColumn('document_id', 'uuid', (column) =>
      column.references('document.id').onDelete('cascade').notNull()
    )
    .addColumn('revision_id', 'uuid', (column) =>
      column.references('document_revision.id').onDelete('cascade').notNull().unique()
    )
    .addColumn('kind', 'text', (column) => column.notNull())
    .addColumn('name', 'text')
    .addColumn('description', 'text')
    .addColumn('created_by', 'text', (column) => column.notNull())
    .addColumn('restored_from_version_id', 'uuid', (column) =>
      column.references('document_version.id').onDelete('set null')
    )
    .addCheckConstraint(
      'document_version_kind_check',
      checkColumnIn('kind', ['checkpoint', 'named'])
    )
    .execute()
  await addCurrentTimestampColumns(database, 'document_version', ['created_at'])
  await database.schema
    .createIndex('document_version_document_index')
    .on('document_version')
    .columns(['document_id', 'created_at desc', 'id desc'])
    .execute()
  // History starts with what each document holds now.
  await sql`
    insert into document_version (id, document_id, revision_id, kind, created_by, created_at)
    select gen_random_uuid(), document.id, revision.id, 'checkpoint', revision.created_by, revision.created_at
    from document
    join document_revision as revision on revision.id = document.current_revision_id
  `.execute(database)
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable('document_version').execute()
}
