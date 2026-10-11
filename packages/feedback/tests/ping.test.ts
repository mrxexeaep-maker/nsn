import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { createTestService, type TestService } from '#feedback-tests/harness'

const BUILD = {
  version: '0.16.0',
  platform: 'macos',
  arch: 'arm64',
  app: 'desktop',
  browser: 'unknown'
}

let service: TestService

beforeAll(async () => {
  service = await createTestService()
})

afterAll(async () => {
  await service.dispose()
})

async function counts() {
  const { results } = await service.db
    .prepare('SELECT day, version, platform, app, count FROM usage_pings ORDER BY version')
    .all()
  return results
}

describe('ping', () => {
  test('counts pings per day and build, never per install', async () => {
    expect((await service.postJSON('/ping', BUILD)).status).toBe(204)
    expect((await service.postJSON('/ping', BUILD)).status).toBe(204)
    expect((await service.postJSON('/ping', { ...BUILD, version: '0.15.1' })).status).toBe(204)

    expect(await counts()).toEqual([
      { day: '2026-10-12', version: '0.15.1', platform: 'macos', app: 'desktop', count: 1 },
      { day: '2026-10-12', version: '0.16.0', platform: 'macos', app: 'desktop', count: 2 }
    ])
  })

  test('refuses a ping carrying anything beyond the build', async () => {
    const before = await counts()
    const response = await service.postJSON('/ping', { ...BUILD, installId: 'a'.repeat(32) })

    expect(response.status).toBe(400)
    expect(await counts()).toEqual(before)
  })

  test('refuses pings over the rate limit', async () => {
    service.limiters.ping.exhausted = true
    try {
      expect((await service.postJSON('/ping', BUILD)).status).toBe(429)
    } finally {
      service.limiters.ping.exhausted = false
    }
  })

  test('answers the desktop and web apps across origins', async () => {
    const response = await service.request('/ping', {
      method: 'OPTIONS',
      headers: {
        Origin: 'tauri://localhost',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    })

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('tauri://localhost')
  })
})
