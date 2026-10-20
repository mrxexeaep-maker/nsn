import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { type FetchCall, createTestService, type TestService } from '#feedback-tests/harness'
import { runSnapshot } from '#feedback/snapshot'
import { releaseFileKind } from '#feedback/snapshot/assets'
import { addDays, daysBetween } from '#feedback/snapshot/days'
import * as v from 'valibot'

let service: TestService

const REPO = 'https://api.github.com/repos/open-pencil/open-pencil'
const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql'
// The cron fires just after midnight, so the day that just ended is Oct 19.
const RUN_AT = new Date('2026-10-20T00:05:00.000Z')
const TABLES = [
  'github_stars',
  'release_downloads',
  'repo_traffic',
  'repo_referrers',
  'site_visits',
  'site_pages',
  'site_countries'
]

const RELEASES = [
  {
    tag_name: 'v0.16.0',
    assets: [
      { name: 'OpenPencil_0.16.0_aarch64.dmg', download_count: 100 },
      { name: 'OpenPencil_aarch64.app.tar.gz', download_count: 300 },
      { name: 'OpenPencil_aarch64.app.tar.gz.sig', download_count: 6 },
      { name: 'OpenPencil_0.16.0_x64-setup.exe', download_count: 234 },
      { name: 'OpenPencil_0.16.0_x64_en-US.msi', download_count: 42 },
      { name: 'OpenPencil_0.16.0_amd64.deb', download_count: 72 },
      { name: 'latest.json', download_count: 1110 },
      { name: 'SHA256SUMS', download_count: 23 }
    ]
  },
  {
    tag_name: 'v0.15.1',
    assets: [{ name: 'OpenPencil_0.15.1_amd64.AppImage', download_count: 393 }]
  }
]

const VariablesSchema = v.object({ variables: v.record(v.string(), v.unknown()) })

/** The GraphQL variables a Cloudflare request carried. */
function variablesOf(call: FetchCall): Record<string, unknown> {
  const result = v.safeParse(
    v.pipe(v.string(), v.parseJson(), VariablesSchema),
    String(call.init?.body)
  )
  if (!result.success) throw new Error('Not a GraphQL request')
  return result.output.variables
}

const cloudflareCalls = () => service.fetchCalls.filter((call) => call.url === GRAPHQL)

function answerGithub() {
  service.respond(REPO, () => Response.json({ stargazers_count: 9120, forks_count: 933 }))
  service.respond(`${REPO}/releases`, () => Response.json(RELEASES))
  service.respond(`${REPO}/traffic/views`, () =>
    Response.json({
      views: [
        { timestamp: '2026-10-18T00:00:00Z', count: 900, uniques: 400 },
        { timestamp: '2026-10-19T00:00:00Z', count: 1200, uniques: 500 },
        { timestamp: '2026-10-20T00:00:00Z', count: 30, uniques: 20 }
      ]
    })
  )
  service.respond(`${REPO}/traffic/clones`, () =>
    Response.json({ clones: [{ timestamp: '2026-10-19T00:00:00Z', count: 80, uniques: 40 }] })
  )
  service.respond(`${REPO}/traffic/popular/referrers`, () =>
    Response.json([{ referrer: 'news.ycombinator.com', count: 700, uniques: 300 }])
  )
}

/** Answers every day with the same visits, and each breakdown with `pages` for the website. */
function answerCloudflare(pages: string[] = ['/', '/download']) {
  service.respond(GRAPHQL, (call) => {
    const variables = variablesOf(call)
    if (typeof variables.start === 'string' && typeof variables.end === 'string') {
      const groups = daysBetween(variables.start, variables.end).flatMap((date) => [
        { sum: { visits: 4000 }, dimensions: { date, clientRequestHTTPHost: 'openpencil.dev' } },
        { sum: { visits: 1000 }, dimensions: { date, clientRequestHTTPHost: 'app.openpencil.dev' } }
      ])
      return Response.json({
        data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: groups }] } }
      })
    }
    return Response.json({
      data: {
        viewer: {
          zones: [
            {
              pages: pages.map((clientRequestPath, index) => ({
                sum: { visits: 100 - index },
                dimensions: { clientRequestPath }
              })),
              countries: [
                { sum: { visits: 60 }, dimensions: { clientCountryName: 'US' } },
                { sum: { visits: 0 }, dimensions: { clientCountryName: 'XX' } }
              ]
            }
          ]
        }
      }
    })
  })
}

async function rows(table: string, order = 'day') {
  const { results } = await service.db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all()
  return results
}

beforeAll(async () => {
  service = await createTestService()
})

beforeEach(async () => {
  await service.db.batch(TABLES.map((table) => service.db.prepare(`DELETE FROM ${table}`)))
  service.fetchCalls.length = 0
  service.setNow(RUN_AT)
  answerGithub()
  answerCloudflare()
})

afterAll(async () => {
  await service.dispose()
})

describe('release files', () => {
  test('counts installers, macOS updates, and update checks, and nothing else', () => {
    expect(releaseFileKind('OpenPencil_0.16.0_aarch64.dmg')).toBe('macos-installer')
    expect(releaseFileKind('OpenPencil_x64.app.tar.gz')).toBe('macos-update')
    expect(releaseFileKind('OpenPencil_0.16.0_arm64-setup.exe')).toBe('windows-installer')
    expect(releaseFileKind('OpenPencil-0.16.0-1.x86_64.rpm')).toBe('linux-installer')
    expect(releaseFileKind('latest.json')).toBe('update-check')
    expect(releaseFileKind('OpenPencil_x64.app.tar.gz.sig')).toBeUndefined()
    expect(releaseFileKind('SHA256SUMS')).toBeUndefined()
  })
})

describe('metrics snapshot', () => {
  test('records GitHub totals as of the end of the day that just ended', async () => {
    expect(await runSnapshot(service.env, service.services)).toEqual({ failed: [] })
    expect(await rows('github_stars')).toEqual([{ day: '2026-10-19', stars: 9120, forks: 933 }])
    expect(await rows('release_downloads', 'tag, kind')).toEqual([
      { day: '2026-10-19', tag: 'v0.15.1', kind: 'linux-installer', downloads: 393 },
      { day: '2026-10-19', tag: 'v0.16.0', kind: 'linux-installer', downloads: 72 },
      { day: '2026-10-19', tag: 'v0.16.0', kind: 'macos-installer', downloads: 100 },
      { day: '2026-10-19', tag: 'v0.16.0', kind: 'macos-update', downloads: 300 },
      { day: '2026-10-19', tag: 'v0.16.0', kind: 'update-check', downloads: 1110 },
      { day: '2026-10-19', tag: 'v0.16.0', kind: 'windows-installer', downloads: 276 }
    ])
    const github = service.fetchCalls.find((call) => call.url === REPO)
    expect(new Headers(github?.init?.headers).get('Authorization')).toBe('Bearer github-token')
  })

  test('reads every page of releases', async () => {
    const page = (tag: string) => ({
      tag_name: tag,
      assets: [{ name: 'latest.json', download_count: 1 }]
    })
    service.respond(`${REPO}/releases?per_page=100&page=1`, () =>
      Response.json(Array.from({ length: 100 }, (_, index) => page(`v0.${index}.0`)))
    )
    service.respond(`${REPO}/releases?per_page=100&page=2`, () => Response.json([page('v1.0.0')]))
    await runSnapshot(service.env, service.services)
    expect(await rows('release_downloads')).toHaveLength(101)
  })

  test('keeps finished traffic days only and replaces the day’s referrers', async () => {
    await service.db
      .prepare("INSERT INTO repo_referrers VALUES ('2026-10-19', 'github.com', 1, 1)")
      .run()
    await runSnapshot(service.env, service.services)
    expect(await rows('repo_traffic')).toEqual([
      { day: '2026-10-18', views: 900, unique_views: 400, clones: 0, unique_clones: 0 },
      { day: '2026-10-19', views: 1200, unique_views: 500, clones: 80, unique_clones: 40 }
    ])
    expect(await rows('repo_referrers')).toEqual([
      { day: '2026-10-19', referrer: 'news.ycombinator.com', views: 700, unique_views: 300 }
    ])
  })

  test('fills four weeks of visits on the first run', async () => {
    await runSnapshot(service.env, service.services)
    const [visits, ...breakdowns] = cloudflareCalls()
    expect(visits && variablesOf(visits)).toMatchObject({
      zone: '6a1c3366d17c9cdefab66cf5dd4e1cbe',
      start: '2026-09-22',
      end: '2026-10-19',
      hosts: ['openpencil.dev', 'app.openpencil.dev']
    })
    expect(new Headers(visits?.init?.headers).get('Authorization')).toBe('Bearer cloudflare-token')
    expect(breakdowns.map((call) => variablesOf(call).host)).toEqual(
      Array.from({ length: 28 }, () => 'openpencil.dev')
    )
    expect(await rows('site_visits')).toHaveLength(56)
    expect(await rows('site_countries')).toHaveLength(28)
  })

  test('the next night fetches only the days Cloudflare may still be counting', async () => {
    await runSnapshot(service.env, service.services)
    service.fetchCalls.length = 0
    service.setNow(new Date(Date.parse(RUN_AT.toISOString()) + 24 * 60 * 60 * 1000))
    await runSnapshot(service.env, service.services)
    const [visits] = cloudflareCalls()
    expect(visits && variablesOf(visits)).toMatchObject({ start: '2026-10-18', end: '2026-10-20' })
    expect(cloudflareCalls()).toHaveLength(4)
  })

  test('a gap longer than the settling days is filled from where the records stop', async () => {
    const recorded = addDays('2026-10-19', -10)
    await service.db
      .prepare("INSERT INTO site_visits VALUES (?, 'openpencil.dev', 1)")
      .bind(recorded)
      .run()
    await runSnapshot(service.env, service.services)
    const [visits] = cloudflareCalls()
    expect(visits && variablesOf(visits)).toMatchObject({ start: addDays(recorded, 1) })
  })

  test('a page that drops out of the ranking is removed when its day is fetched again', async () => {
    await runSnapshot(service.env, service.services)
    answerCloudflare(['/'])
    await runSnapshot(service.env, service.services)
    const { results } = await service.db
      .prepare("SELECT path FROM site_pages WHERE day = '2026-10-19'")
      .all()
    expect(results).toEqual([{ path: '/' }])
  })

  test('one source failing still records the others', async () => {
    service.respond(REPO, () => new Response('unavailable', { status: 503 }))
    service.respond(`${REPO}/releases`, () => new Response('unavailable', { status: 503 }))
    expect(await runSnapshot(service.env, service.services)).toEqual({ failed: ['github'] })
    expect(await rows('github_stars')).toEqual([])
    expect(await rows('repo_traffic')).toHaveLength(2)
    expect(await rows('site_visits')).toHaveLength(56)
  })

  test('an answer of the wrong shape fails that source rather than recording it', async () => {
    service.respond(GRAPHQL, () => Response.json({ data: null, errors: [{ message: 'quota' }] }))
    expect(await runSnapshot(service.env, service.services)).toEqual({ failed: ['site'] })
    expect(await rows('site_visits')).toEqual([])
  })
})
