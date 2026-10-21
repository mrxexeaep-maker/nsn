import { isCloudPortalPage } from '#cloud/contract'
import { PORTAL_PAGE_HEADERS, portalFileCacheControl } from '#cloud/runtime/portal/headers'

const PAGE_PATH = '/cloud.html'

function readable(request: Request) {
  return request.method === 'GET' || request.method === 'HEAD'
}

/**
 * Serves the built Cloud portal from the Worker's static assets: `cloud.html` for portal pages,
 * and its hashed assets and icons for paths the API does not answer.
 */
export function createCloudflareCloudPortal(assets: Fetcher) {
  return {
    /** The portal page for `request`, or null when it is not one. */
    async page(request: Request): Promise<Response | null> {
      if (!readable(request) || !isCloudPortalPage(new URL(request.url).pathname)) return null
      const page = await assets.fetch(new URL(PAGE_PATH, request.url), { method: request.method })
      return page.ok ? new Response(page.body, { headers: PORTAL_PAGE_HEADERS }) : null
    },

    /** A portal file for `request`, or null when there is none. */
    async file(request: Request): Promise<Response | null> {
      const path = new URL(request.url).pathname
      if (!readable(request) || path === PAGE_PATH) return null
      const file = await assets.fetch(request)
      if (!file.ok) return null
      const headers = new Headers(file.headers)
      headers.set('Cache-Control', portalFileCacheControl(path))
      headers.set('X-Content-Type-Options', 'nosniff')
      return new Response(file.body, { status: file.status, headers })
    }
  }
}
