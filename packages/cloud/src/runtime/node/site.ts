import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

import type { SiteFiles } from '#cloud/runtime/site/server'
import { getMimeType } from 'hono/utils/mime'

/** Request headers a development server would answer with 304 or an encoding the reply drops. */
const UNFORWARDED_HEADERS = ['host', 'if-none-match', 'if-modified-since', 'accept-encoding']

/** The built site's files in `directory`, never anything outside it. */
export function nodeSiteFiles(directory: string): SiteFiles {
  const root = resolve(directory)
  return async (path) => {
    let decoded: string
    try {
      decoded = decodeURIComponent(path)
    } catch {
      return null
    }
    const file = resolve(root, `.${decoded}`)
    if (!file.startsWith(`${root}${sep}`)) return null
    try {
      return {
        body: new Uint8Array(await readFile(file)),
        // Documents such as the editor's demo `.fig` have no registered type.
        type: getMimeType(decoded) ?? 'application/octet-stream'
      }
    } catch {
      return null
    }
  }
}

/**
 * The site as the Vite development server at `origin` serves it, for `bun run cloud:dev`: pages,
 * modules, and styles come from source as they are now, so an edit shows without a build.
 */
export function developmentSiteFiles(origin: string): SiteFiles {
  return async (path, request) => {
    const url = new URL(path, origin)
    const requested = new URL(request.url)
    // Vite tells module requests apart by their query, such as `?import` or `?t=`.
    if (requested.pathname === path) url.search = requested.search
    const headers = new Headers(request.headers)
    for (const name of UNFORWARDED_HEADERS) headers.delete(name)
    try {
      const response = await fetch(url, { headers })
      if (!response.ok || !response.body) return null
      return {
        body: response.body,
        type: response.headers.get('Content-Type') ?? 'application/octet-stream',
        cacheControl: 'no-cache'
      }
    } catch {
      return null
    }
  }
}
