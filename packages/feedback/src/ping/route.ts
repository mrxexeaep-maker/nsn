import type { FeedbackEnv, FeedbackServices } from '#feedback/app'
import { FEEDBACK_ROUTES, PingSchema } from '#feedback/contract'
import { createFeedbackDatabase } from '#feedback/db'
import { readJSON, withinLimit } from '#feedback/http/request'
import type { Hono } from 'hono'

import { recordPing } from './record'

export function addPingRoute(app: Hono<FeedbackEnv>, services: FeedbackServices): void {
  app.post(FEEDBACK_ROUTES.ping, async (c) => {
    if (!(await withinLimit(c, c.env.PING_LIMITER))) return c.body(null, 429)
    const ping = await readJSON(c, PingSchema)
    if (!ping) return c.body(null, 400)
    await recordPing(createFeedbackDatabase(c.env.DB), ping, services.now())
    return c.body(null, 204)
  })
}
