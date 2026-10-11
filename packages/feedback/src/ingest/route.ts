import type { FeedbackEnv, FeedbackServices } from '#feedback/app'
import { FEEDBACK_ROUTES, UsageBatchSchema } from '#feedback/contract'
import { readJSON, withinLimit } from '#feedback/http/request'
import type { Hono } from 'hono'

import { toPostHogBatch } from './posthog'

/** Forwards a valid usage batch to PostHog and stores nothing; anything off the event list is refused. */
export function addIngestRoute(app: Hono<FeedbackEnv>, services: FeedbackServices): void {
  app.post(FEEDBACK_ROUTES.ingest, async (c) => {
    if (!(await withinLimit(c, c.env.INGEST_LIMITER))) return c.body(null, 429)
    const batch = await readJSON(c, UsageBatchSchema)
    if (!batch) return c.body(null, 400)
    const response = await services
      .fetch(`${c.env.POSTHOG_HOST}/batch/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPostHogBatch(batch, c.env.POSTHOG_KEY))
      })
      .catch(() => null)
    return c.body(null, response?.ok ? 204 : 502)
  })
}
