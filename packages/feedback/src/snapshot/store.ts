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

// D1 binds at most 100 values per statement, so long lists go in several inserts.
const MAX_BOUND_VALUES = 100

/** Writes rows over any already recorded under the same key, so a rerun corrects a day. */
export async function replaceRows<T extends SnapshotTable>(
  db: Kysely<FeedbackDatabase>,
  table: T,
  rows: Insertable<FeedbackDatabase[T]>[]
): Promise<void> {
  const [first] = rows
  if (!first) return
  const perStatement = Math.max(1, Math.floor(MAX_BOUND_VALUES / Object.keys(first).length))
  for (const batch of chunk(rows, perStatement)) await db.replaceInto(table).values(batch).execute()
}

type RankingTable = 'repoReferrers' | 'sitePages' | 'siteCountries'

// One query per table: Kysely cannot type a delete over a union of tables.
const CLEAR_DAY: Record<
  RankingTable,
  (db: Kysely<FeedbackDatabase>, day: string) => Promise<unknown>
> = {
  repoReferrers: (db, day) => db.deleteFrom('repoReferrers').where('day', '=', day).execute(),
  sitePages: (db, day) => db.deleteFrom('sitePages').where('day', '=', day).execute(),
  siteCountries: (db, day) => db.deleteFrom('siteCountries').where('day', '=', day).execute()
}

/**
 * Replaces everything recorded for `day` in a table holding a ranking, so entries that dropped
 * out of the ranking since the last run do not linger.
 */
export async function replaceDay<T extends RankingTable>(
  db: Kysely<FeedbackDatabase>,
  table: T,
  day: string,
  rows: Insertable<FeedbackDatabase[T]>[]
): Promise<void> {
  await CLEAR_DAY[table](db, day)
  await replaceRows(db, table, rows)
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
