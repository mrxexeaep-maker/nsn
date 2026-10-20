import { createFeedbackDatabase } from '#feedback/db'
import type { FeedbackDatabase } from '#feedback/db'
import type { FeedbackBindings, FeedbackServices } from '#feedback/env'
import { compact } from 'es-toolkit'
import type { Kysely } from 'kysely'

import { cloudflareClient } from './cloudflare'
import { addDays, daysBetween, utcDay } from './days'
import { githubClient } from './github'
import { lastDay, replaceDay, replaceRows } from './store'

/**
 * How far back the visit history is filled: Cloudflare's Free plan keeps 31 days and answers at
 * most 30 per query, so four weeks stays inside both.
 */
const BACKFILL_DAYS = 28
/** Days Cloudflare may still be counting; they are fetched again on the next runs. */
const SETTLING_DAYS = 3

export type SnapshotSource = 'github' | 'traffic' | 'site'

interface Run {
  db: Kysely<FeedbackDatabase>
  env: FeedbackBindings
  services: FeedbackServices
  today: string
  /** The day that just ended, which this run records. */
  yesterday: string
}

/** Stars, forks, and running download totals as of the end of yesterday. */
async function recordGithub({ db, env, services, yesterday }: Run) {
  const github = githubClient(services.fetch, env.GITHUB_REPOSITORY, env.GITHUB_TOKEN)
  const totals = await github.totals()
  await replaceRows(db, 'githubStars', [
    { day: yesterday, stars: totals.stars, forks: totals.forks }
  ])
  await replaceRows(
    db,
    'releaseDownloads',
    totals.downloads.map((file) => ({ day: yesterday, ...file }))
  )
}

/** GitHub's last 14 days of views and clones, finished days only, and its referrer ranking. */
async function recordTraffic({ db, env, services, today, yesterday }: Run) {
  const github = githubClient(services.fetch, env.GITHUB_REPOSITORY, env.GITHUB_TOKEN)
  const traffic = await github.traffic()
  await replaceRows(
    db,
    'repoTraffic',
    traffic.days.filter((day) => day.day < today)
  )
  await replaceDay(
    db,
    'repoReferrers',
    yesterday,
    traffic.referrers.map((referrer) => ({ day: yesterday, ...referrer }))
  )
}

/**
 * Visits per hostname, and the website's pages and countries, for every day not recorded yet
 * plus the last few, which Cloudflare may still have been counting.
 */
async function recordSite({ db, env, services, yesterday }: Run) {
  const cloudflare = cloudflareClient(
    services.fetch,
    env.SITE_ZONE_ID,
    env.CLOUDFLARE_ANALYTICS_TOKEN
  )
  const hosts = env.SITE_HOSTS.split(',').map((host) => host.trim())
  const [website] = hosts
  const oldest = addDays(yesterday, 1 - BACKFILL_DAYS)
  const recorded = await lastDay(db, 'siteVisits')
  const next = recorded ? addDays(recorded, 1) : oldest
  // Start at the first missing day or the first still settling, whichever is earlier, but never
  // before the oldest day Cloudflare still has.
  const start = later(earlier(next, addDays(yesterday, 1 - SETTLING_DAYS)), oldest)

  await replaceRows(db, 'siteVisits', await cloudflare.visits(start, yesterday, hosts))
  if (!website) return
  for (const day of daysBetween(start, yesterday)) {
    const { pages, countries } = await cloudflare.breakdown(day, website)
    await replaceDay(db, 'sitePages', day, pages)
    await replaceDay(db, 'siteCountries', day, countries)
  }
}

const earlier = (a: string, b: string) => (a < b ? a : b)
const later = (a: string, b: string) => (a > b ? a : b)

const SOURCES: [SnapshotSource, (run: Run) => Promise<void>][] = [
  ['github', recordGithub],
  ['traffic', recordTraffic],
  ['site', recordSite]
]

/**
 * The daily metrics snapshot, run just after midnight UTC. GitHub reports only running totals
 * and keeps traffic for 14 days, and Cloudflare keeps visits for 31, so these tables are the
 * only lasting history. Each source runs on its own: one failing still records the others, and
 * its gap is filled by the next run where the API still has the days.
 */
export async function runSnapshot(
  env: FeedbackBindings,
  services: FeedbackServices
): Promise<{ failed: SnapshotSource[] }> {
  const today = utcDay(services.now())
  const run: Run = {
    db: createFeedbackDatabase(env.DB),
    env,
    services,
    today,
    yesterday: addDays(today, -1)
  }
  const failed = await Promise.all(
    SOURCES.map(async ([source, record]) => {
      try {
        await record(run)
        return undefined
      } catch (error) {
        console.error('Metrics snapshot failed', { source, error: String(error) })
        return source
      }
    })
  )
  return { failed: compact(failed) }
}
