import * as v from 'valibot'

/** The longest range one request covers; a year and a bit leaves room for "all time" for now. */
export const MAX_METRICS_RANGE_DAYS = 400

const DAY_MS = 24 * 60 * 60 * 1000
const IsoDay = v.pipe(v.string(), v.isoDate())

/** The UTC days the dashboard asks about, both included. */
export const MetricsQuerySchema = v.pipe(
  v.object({ start: IsoDay, end: IsoDay }),
  v.check(({ start, end }) => start <= end, 'The range ends before it starts.'),
  v.check(
    ({ start, end }) => (Date.parse(end) - Date.parse(start)) / DAY_MS < MAX_METRICS_RANGE_DAYS,
    'The range is too long.'
  )
)

export type MetricsQuery = v.InferOutput<typeof MetricsQuerySchema>

export interface RankedCount {
  name: string
  value: number
}

export interface DailyGrowth {
  day: string
  added: number
}

/** What PostHog knows about the installs that share usage stats; `null` when it could not be asked. */
export interface MetricsUsage {
  /** Different installs that opened the app in the range. */
  installs: number
  daily: { day: string; installs: number }[]
  /** Per first day: index 0 is how many installs started then, index n how many came back n days later. */
  retention: { cohort: string; values: number[] }[]
  documents: RankedCount[]
  exports: RankedCount[]
  aiProviders: RankedCount[]
}

/**
 * Everything the metrics dashboard shows for a range of UTC days. Days are ISO dates; `today`
 * is still being counted, and snapshot-based numbers only reach the last finished day.
 */
export interface MetricsSnapshot {
  asOf: string
  today: string
  start: string
  end: string
  /** Installs that pinged each day, by desktop and web. */
  dailyActive: { day: string; desktop: number; web: number }[]
  /** Pings in the range by OS, desktop and web. */
  platforms: { os: string; desktop: number; web: number }[]
  /** Pings each day on the newest stable version and on everything else. */
  versions: { latest: string | null; daily: { day: string; latest: number; other: number }[] }
  /** The first day each stable version sent a ping, within the range. */
  releases: { day: string; version: string }[]
  /** Cloudflare visits each day to the website and to the web app. */
  visits: { day: string; site: number; app: number }[]
  website: { pages: RankedCount[]; countries: RankedCount[] }
  github: {
    stars: { total: number | null; daily: DailyGrowth[] }
    /** Installer downloads across every release, and update checks from running desktop apps. */
    downloads: {
      total: number | null
      latestTag: string | null
      latestTotal: number | null
      daily: DailyGrowth[]
      updateChecks: DailyGrowth[]
    }
    traffic: { day: string; views: number; uniqueViews: number; clones: number }[]
    referrers: RankedCount[]
  }
  waitlist: {
    total: number
    confirmed: number
    added: number
    /** Newest first, by email domain only. */
    recent: { domain: string; signedUpAt: string; confirmed: boolean }[]
  }
  usage: MetricsUsage | null
}
