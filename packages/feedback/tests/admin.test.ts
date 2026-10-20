import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { createTestService, type TestService } from '#feedback-tests/harness'
import type { MetricsSnapshot } from '#feedback/contract'
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose'

let service: TestService
let signingKey: CryptoKey
let strangerKey: CryptoKey

const TEAM = 'https://openpencil.cloudflareaccess.com'
const AUDIENCE = 'admin-audience'
const POSTHOG_QUERY = 'https://eu.posthog.com/api/projects/267806/query/'
const NOW = new Date('2026-10-20T12:00:00.000Z')
const TABLES = [
  'usage_pings',
  'waitlist',
  'github_stars',
  'release_downloads',
  'repo_traffic',
  'repo_referrers',
  'site_visits',
  'site_pages',
  'site_countries'
]

/** An Access token as Cloudflare would issue it, signed with `key`. */
function accessToken(key: CryptoKey, claims: { aud?: string; iss?: string } = {}) {
  const seconds = Math.floor(NOW.getTime() / 1000)
  return new SignJWT({ email: 'dan@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'current' })
    .setIssuer(claims.iss ?? TEAM)
    .setAudience(claims.aud ?? AUDIENCE)
    .setIssuedAt(seconds)
    .setExpirationTime(seconds + 3600)
    .sign(key)
}

async function getSnapshot(query: string, token?: string) {
  return service.request(`/admin/api/snapshot?${query}`, {
    headers: token ? { 'cf-access-jwt-assertion': token } : {}
  })
}

/** The snapshot through the typed client, as the dashboard asks for it. */
async function snapshot(start = '2026-10-14', end = '2026-10-20'): Promise<MetricsSnapshot> {
  const response = await service.client.admin.api.snapshot.$get(
    { query: { start, end } },
    { headers: { 'cf-access-jwt-assertion': await accessToken(signingKey) } }
  )
  if (response.status !== 200) throw new Error(`The snapshot answered ${response.status}`)
  return response.json()
}

function run(sqlText: string, ...values: unknown[]) {
  return service.db
    .prepare(sqlText)
    .bind(...values)
    .run()
}

/** PostHog answers the usage query, then the retention query. */
function answerPostHog() {
  service.respond(POSTHOG_QUERY, (call) => {
    const body = String(call.init?.body)
    if (body.includes('INNER JOIN'))
      return Response.json({
        results: [
          ['2026-10-14', 0, 28],
          ['2026-10-14', 1, 9],
          ['2026-10-14', 3, 3],
          ['2026-10-15', 0, 59]
        ]
      })
    return Response.json({
      results: [
        ['installs', '2026-10-15', 68],
        ['installs', '2026-10-14', 30],
        ['unique', '', 216],
        ['document_opened', 'fig', 496],
        ['document_opened', 'pen', 19],
        ['ai_reply_finished', 'openrouter', 22],
        ['ai_reply_finished', 'openai-compatible', 85]
      ]
    })
  })
}

beforeAll(async () => {
  service = await createTestService()
  const current = await generateKeyPair('RS256')
  signingKey = current.privateKey
  strangerKey = (await generateKeyPair('RS256')).privateKey
  const publicKey = { ...(await exportJWK(current.publicKey)), kid: 'current', alg: 'RS256' }
  service.respond(`${TEAM}/cdn-cgi/access/certs`, () => Response.json({ keys: [publicKey] }))
})

beforeEach(async () => {
  await service.db.batch(TABLES.map((table) => service.db.prepare(`DELETE FROM ${table}`)))
  service.setNow(NOW)
  answerPostHog()
})

afterAll(async () => {
  await service.dispose()
})

describe('admin access', () => {
  test('refuses a request without an Access token', async () => {
    expect((await getSnapshot('start=2026-10-14&end=2026-10-20')).status).toBe(403)
  })

  test('refuses a token Cloudflare did not sign', async () => {
    const token = await accessToken(strangerKey)
    expect((await getSnapshot('start=2026-10-14&end=2026-10-20', token)).status).toBe(403)
  })

  test('refuses a token for another Access application or team', async () => {
    const otherApp = await accessToken(signingKey, { aud: 'another-app' })
    const otherTeam = await accessToken(signingKey, {
      iss: 'https://elsewhere.cloudflareaccess.com'
    })
    expect((await getSnapshot('start=2026-10-14&end=2026-10-20', otherApp)).status).toBe(403)
    expect((await getSnapshot('start=2026-10-14&end=2026-10-20', otherTeam)).status).toBe(403)
  })

  test('refuses everyone while Access is not configured', async () => {
    const audience = service.env.ACCESS_AUD
    service.env.ACCESS_AUD = ''
    try {
      const token = await accessToken(signingKey)
      expect((await getSnapshot('start=2026-10-14&end=2026-10-20', token)).status).toBe(403)
    } finally {
      service.env.ACCESS_AUD = audience
    }
  })

  test('answers a signed-in request without letting caches keep it', async () => {
    const response = await getSnapshot(
      'start=2026-10-14&end=2026-10-20',
      await accessToken(signingKey)
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  test('rejects a missing, malformed, or reversed range', async () => {
    const token = await accessToken(signingKey)
    for (const query of [
      'start=2026-02-30&end=2026-03-02',
      'start=2026-10-14',
      'start=yesterday&end=2026-10-20',
      'start=2026-10-20&end=2026-10-14'
    ])
      expect((await getSnapshot(query, token)).status).toBe(400)
  })
})

describe('metrics snapshot API', () => {
  test('daily active installs cover every day, with no pings counting as zero', async () => {
    await run(
      "INSERT INTO usage_pings VALUES ('2026-10-15', '0.16.0', 'macos', 'arm64', 'desktop', 'unknown', 'unset', 400)"
    )
    await run(
      "INSERT INTO usage_pings VALUES ('2026-10-15', '0.16.0', 'windows', 'x64', 'web', 'chrome', 'unset', 300)"
    )
    const { dailyActive } = await snapshot('2026-10-14', '2026-10-16')
    expect(dailyActive).toEqual([
      { day: '2026-10-14', desktop: 0, web: 0 },
      { day: '2026-10-15', desktop: 400, web: 300 },
      { day: '2026-10-16', desktop: 0, web: 0 }
    ])
  })

  test('an end after today stops at today', async () => {
    const result = await snapshot('2026-10-19', '2026-12-31')
    expect(result.end).toBe('2026-10-20')
    expect(result.dailyActive.map((day) => day.day)).toEqual(['2026-10-19', '2026-10-20'])
  })

  test('versions split the newest stable release from the rest and mark its first day', async () => {
    for (const [day, version, count] of [
      ['2026-10-13', '0.16.0-beta.3', 4],
      ['2026-10-14', '0.15.1', 2],
      ['2026-10-14', '0.16.0', 354],
      ['2026-10-14', '0.16.0-beta.2', 9],
      ['2026-10-15', '0.0.0-smoke', 1]
    ] as const)
      await run(
        'INSERT INTO usage_pings VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        day,
        version,
        'macos',
        'arm64',
        'desktop',
        'unknown',
        'unset',
        count
      )
    const { versions, releases } = await snapshot('2026-10-14', '2026-10-15')
    expect(versions.latest).toBe('0.16.0')
    expect(versions.daily).toEqual([
      { day: '2026-10-14', latest: 354, other: 11 },
      { day: '2026-10-15', latest: 0, other: 1 }
    ])
    expect(releases).toEqual([
      { day: '2026-10-14', version: '0.15.1' },
      { day: '2026-10-14', version: '0.16.0' }
    ])
  })

  test('platforms add desktop and web per OS, largest first', async () => {
    await run(
      "INSERT INTO usage_pings VALUES ('2026-10-15', '0.16.0', 'linux', 'x64', 'web', 'firefox', 'unset', 5)"
    )
    await run(
      "INSERT INTO usage_pings VALUES ('2026-10-15', '0.16.0', 'macos', 'arm64', 'desktop', 'unknown', 'unset', 9)"
    )
    await run(
      "INSERT INTO usage_pings VALUES ('2026-10-16', '0.16.0', 'macos', 'arm64', 'web', 'safari', 'unset', 3)"
    )
    expect((await snapshot()).platforms).toEqual([
      { os: 'macos', desktop: 9, web: 3 },
      { os: 'linux', desktop: 0, web: 5 }
    ])
  })

  test('downloads and stars grow by the difference between end-of-day totals', async () => {
    await run(
      "INSERT INTO github_stars VALUES ('2026-10-13', 9000, 900), ('2026-10-14', 9030, 905), ('2026-10-15', 9068, 910)"
    )
    await run(`INSERT INTO release_downloads VALUES
      ('2026-10-13', 'v0.15.1', 'windows-installer', 2000), ('2026-10-13', 'v0.15.1', 'update-check', 15000),
      ('2026-10-14', 'v0.15.1', 'windows-installer', 2010), ('2026-10-14', 'v0.16.0', 'macos-installer', 100),
      ('2026-10-14', 'v0.16.0', 'update-check', 1110), ('2026-10-14', 'v0.15.1', 'update-check', 15400)`)
    const { github } = await snapshot('2026-10-14', '2026-10-15')
    expect(github.stars).toEqual({
      total: 9068,
      daily: [
        { day: '2026-10-14', added: 30 },
        { day: '2026-10-15', added: 38 }
      ]
    })
    expect(github.downloads).toEqual({
      total: 2110,
      latestTag: 'v0.16.0',
      latestTotal: 100,
      daily: [{ day: '2026-10-14', added: 110 }],
      updateChecks: [{ day: '2026-10-14', added: 1510 }]
    })
  })

  test('visits pivot to the website and the web app, and rankings add up the range', async () => {
    await run(
      "INSERT INTO site_visits VALUES ('2026-10-14', 'openpencil.dev', 3884), ('2026-10-14', 'app.openpencil.dev', 729)"
    )
    await run(
      "INSERT INTO site_pages VALUES ('2026-10-14', '/', 900), ('2026-10-15', '/', 1000), ('2026-10-15', '/download', 80)"
    )
    await run(
      "INSERT INTO site_countries VALUES ('2026-10-14', 'US', 800), ('2026-10-15', 'CN', 200)"
    )
    const result = await snapshot('2026-10-14', '2026-10-15')
    expect(result.visits).toEqual([
      { day: '2026-10-14', site: 3884, app: 729 },
      { day: '2026-10-15', site: 0, app: 0 }
    ])
    expect(result.website).toEqual({
      pages: [
        { name: '/', value: 1900 },
        { name: '/download', value: 80 }
      ],
      countries: [
        { name: 'US', value: 800 },
        { name: 'CN', value: 200 }
      ]
    })
  })

  test('the waitlist shows email domains only', async () => {
    await run(`INSERT INTO waitlist (email, email_key, note, token, created_at, confirmation_sent_at, confirmed_at) VALUES
      ('Ada@Example.com', 'ada@example.com', NULL, 't1', '2026-10-15T08:00:00.000Z', '2026-10-15T08:00:00.000Z', '2026-10-15T08:01:00.000Z'),
      ('bob@studio.io', 'bob@studio.io', 'note', 't2', '2026-10-01T08:00:00.000Z', '2026-10-01T08:00:00.000Z', NULL)`)
    const { waitlist } = await snapshot()
    expect(waitlist).toEqual({
      total: 2,
      confirmed: 1,
      added: 1,
      recent: [{ domain: 'example.com', signedUpAt: '2026-10-15T08:00:00.000Z', confirmed: true }]
    })
    expect(JSON.stringify(waitlist)).not.toContain('@')
  })

  test('usage comes from PostHog with a read-only personal key', async () => {
    const { usage } = await snapshot()
    expect(usage).toEqual({
      installs: 216,
      daily: [
        { day: '2026-10-14', installs: 30 },
        { day: '2026-10-15', installs: 68 }
      ],
      retention: [
        { cohort: '2026-10-14', values: [28, 9, 0, 3] },
        { cohort: '2026-10-15', values: [59] }
      ],
      documents: [
        { name: 'fig', value: 496 },
        { name: 'pen', value: 19 }
      ],
      exports: [],
      aiProviders: [
        { name: 'openai-compatible', value: 85 },
        { name: 'openrouter', value: 22 }
      ]
    })
    const call = service.fetchCalls.findLast((candidate) => candidate.url === POSTHOG_QUERY)
    expect(new Headers(call?.init?.headers).get('Authorization')).toBe('Bearer phx_test')
  })

  test('PostHog failing leaves usage empty and the rest of the page intact', async () => {
    service.respond(POSTHOG_QUERY, () => new Response('busy', { status: 503 }))
    const result = await snapshot()
    expect(result.usage).toBeNull()
    expect(result.dailyActive).toHaveLength(7)
  })
})
