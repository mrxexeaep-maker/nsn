import { describe, expect, test } from 'bun:test'

import { s3HostFromEndpoint } from '@/app/integrations/storage/s3/host'

describe('S3 host detection', () => {
  test('recognizes providers with their own bucket setup', () => {
    expect(s3HostFromEndpoint('https://s3.eu-central-003.backblazeb2.com')).toBe('b2')
    expect(s3HostFromEndpoint('https://abc123.r2.cloudflarestorage.com')).toBe('r2')
    expect(s3HostFromEndpoint('https://s3.us-east-1.amazonaws.com')).toBe('aws')
    expect(s3HostFromEndpoint('http://localhost:9000')).toBe('other')
  })

  test('ignores provider names outside the hostname', () => {
    expect(s3HostFromEndpoint('https://minio.example.com/backblazeb2.com')).toBe('other')
    expect(s3HostFromEndpoint('https://amazonaws.com.example.net')).toBe('other')
  })

  test('returns null for text that is not a URL', () => {
    expect(s3HostFromEndpoint('')).toBeNull()
    expect(s3HostFromEndpoint('s3.backblazeb2.com')).toBeNull()
  })
})
