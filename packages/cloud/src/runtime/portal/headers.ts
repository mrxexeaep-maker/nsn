/** Headers for the portal's one page, `cloud.html`, whichever runtime serves it. */
export const PORTAL_PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-cache',
  // Desktop sign-in approval must never be framed by another site.
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
}

/** How long a portal file at `path` may be cached: hashed assets for good, the rest for an hour. */
export function portalFileCacheControl(path: string): string {
  return path.startsWith('/assets/')
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600'
}
