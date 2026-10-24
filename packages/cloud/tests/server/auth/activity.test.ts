import { describe, expect, test } from 'bun:test'

import { signInMethod } from '#cloud/server/auth/activity'
import { describeUserAgent } from '#cloud/server/auth/user-agent'

describe('sign-in activity', () => {
  test('names how each Better Auth endpoint signed someone in', () => {
    expect(signInMethod('/api/auth/sign-in/email')).toBe('password')
    expect(signInMethod('/api/auth/callback/google')).toBe('google')
    expect(signInMethod('/api/auth/callback/apple')).toBe('apple')
    expect(signInMethod('/api/auth/passkey/verify-authentication')).toBe('passkey')
    expect(signInMethod('/api/auth/two-factor/verify-totp')).toBe('two-step')
    expect(signInMethod('/api/auth/verify-email')).toBe('email-link')
    expect(signInMethod('/api/auth/device/token')).toBe('desktop')
  })

  test('ignores endpoints that only refresh or change a session', () => {
    expect(signInMethod('/api/auth/get-session')).toBeNull()
    expect(signInMethod('/api/auth/update-user')).toBeNull()
  })

  test('reads a browser and system from a user agent, and nothing from none', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'
      )
    ).toEqual({ browser: 'Microsoft Edge 141', system: 'Windows' })
    expect(describeUserAgent(null)).toEqual({ browser: null, system: null })
  })
})
