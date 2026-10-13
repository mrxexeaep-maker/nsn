/** Hosts whose bucket setup differs enough to need their own instructions. */
export type S3Host = 'b2' | 'r2' | 'aws' | 'other'

/** Recognize the storage host from an endpoint URL; null when it is not a URL. */
export function s3HostFromEndpoint(endpoint: string): S3Host | null {
  let hostname: string
  try {
    hostname = new URL(endpoint.trim()).hostname
  } catch {
    return null
  }
  if (!hostname) return null
  if (hostname.endsWith('.r2.cloudflarestorage.com')) return 'r2'
  if (hostname.endsWith('.amazonaws.com')) return 'aws'
  if (hostname.endsWith('.backblazeb2.com')) return 'b2'
  return 'other'
}
