import { beforeEach, describe, expect, test } from 'bun:test'

import { appPreferences, DEFAULT_APP_PREFERENCES } from '@/app/settings/preferences/store'
import { setUsageStatsConsent, shouldAskUsageStats } from '@/app/telemetry'
import { sharingState } from '@/app/telemetry/state'

beforeEach(() => {
  appPreferences.value = structuredClone(DEFAULT_APP_PREFERENCES)
  sharingState.value = { installId: null, lastPingDay: null }
})

describe('usage stats consent', () => {
  test('agreeing makes a random install ID that stays across answers', () => {
    setUsageStatsConsent(true)
    const { installId } = sharingState.value

    expect(appPreferences.value.sharing.usageStats).toBe('granted')
    expect(installId).toMatch(/^[0-9a-f]{32}$/)
    setUsageStatsConsent(true)
    expect(sharingState.value.installId).toBe(installId)
  })

  test('stopping deletes the install ID, so agreeing again starts a new one', () => {
    setUsageStatsConsent(true)
    const first = sharingState.value.installId
    setUsageStatsConsent(false)

    expect(appPreferences.value.sharing.usageStats).toBe('denied')
    expect(sharingState.value.installId).toBeNull()
    setUsageStatsConsent(true)
    expect(sharingState.value.installId).not.toBe(first)
  })

  test('a build that sends nothing never asks', () => {
    expect(shouldAskUsageStats()).toBe(false)
  })
})
