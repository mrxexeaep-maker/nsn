import { describe, expect, test } from 'bun:test'

import { providerCredentialRef } from '@/app/settings/credentials/migration'
import { credentialKey } from '@/app/settings/credentials/reference'

describe('provider credential references', () => {
  test('stores a Cursor user key under its own integration', () => {
    expect(credentialKey(providerCredentialRef('acp:cursor', 'cursor-main'))).toBe(
      'v1:acp-cursor:cursor-main:api-key'
    )
  })

  test('refuses an API key for an agent that signs in on its own', () => {
    expect(() => providerCredentialRef('acp:claude-code')).toThrow(
      'ACP agents do not use API-key credentials'
    )
  })
})
