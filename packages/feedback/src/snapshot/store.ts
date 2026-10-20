import type { FeedbackDatabase } from '#feedback/db'
import { chunk } from 'es-toolkit'
import type { Insertable, Kysely } from 'kysely'

type SnapshotTable =
  | 'githubStars'
  | 'releaseDownloads'
  | 'repoTraffic'
  | 'repoReferrers'
  | 'siteVisits'
  | 'sitePages'
  | 'siteCountries'

// D1 binds at most 100 values per statement, so long lists go in several statements.
const MAX_BOUND_VALUES = 100

type ClearDays = (db: Kysely<FeedbackDatabase>, days: string[]) => Promise<unknown>

// One query per table: Kysely cannot type a delete over a union of tables.
const CLEAR_DAYS: Record<SnapshotTable, ClearDays> = {
  githubStars: (db, days) => db.deleteFrom('githubStars').where('day', 'in', days).execute(),
  releaseDownloads: (db, days) =>
    db.deleteFrom('releaseDownloads').where('day', 'in', days).execute(),
  repoTraffic: (db, days) => db.deleteFrom('repoTraffic').where('day', 'in', days).execute(),
  repoReferrers: (db, days) => db.deleteFrom('repoReferrers').where('day', 'in', days).execute(),
  siteVisits: (db, days) => db.deleteFrom('siteVisits').where('day', 'in', days).execute(),
  sitePages: (db, days) => db.deleteFrom('sitePages').where('day', 'in', days).execute(),
  siteCountries: (db, days) => db.deleteFrom('siteCountries').where('day', 'in', days).execute()
}

/**
 * Makes `days` hold exactly `rows`: whatever was recorded for those days goes first, so an
 * entry the latest answer no longer has (a host without visits, a page out of the ranking, a
 * removed release file) does not linger, and a rerun corrects a day instead of adding to it.
 */
export async function replaceDays<T extends SnapshotTable>(
  db: Kysely<FeedbackDatabase>,
  table: T,
  days: string[],
  rows: Insertable<FeedbackDatabase[T]>[]
): Promise<void> {
  for (const batch of chunk(days, MAX_BOUND_VALUES)) await CLEAR_DAYS[table](db, batch)
  const [first] = rows
  if (!first) return
  const perStatement = Math.max(1, Math.floor(MAX_BOUND_VALUES / Object.keys(first).length))
  for (const batch of chunk(rows, perStatement)) await db.insertInto(table).values(batch).execute()
}

/** The newest day recorded in a table, if any. */
export async function lastDay(
  db: Kysely<FeedbackDatabase>,
  table: 'siteVisits'
): Promise<string | undefined> {
  const row = await db
    .selectFrom(table)
    .select((eb) => eb.fn.max('day').as('day'))
    .executeTakeFirst()
  return row?.day ?? undefined
}
