import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { allowOpenPencilOrigins } from './http/cors'
import { addIngestRoute } from './ingest/route'
import { addPingRoute } from './ping/route'
import { addWaitlistRoutes } from './waitlist/route'

/** What the service reaches outside its bindings, injectable for tests. */
export interface FeedbackServices {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  now: () => Date
}

export type FeedbackEnv = { Bindings: Env }

const MAX_BODY_BYTES = 16 * 1024

const defaultServices: FeedbackServices = {
  fetch: (input, init) => fetch(input, init),
  now: () => new Date()
}

export function createFeedbackApp(services: FeedbackServices = defaultServices) {
  const app = new Hono<FeedbackEnv>()
  app.use('*', allowOpenPencilOrigins)
  app.use('*', bodyLimit({ maxSize: MAX_BODY_BYTES }))
  addPingRoute(app, services)
  addIngestRoute(app, services)
  addWaitlistRoutes(app, services)
  return app
}
