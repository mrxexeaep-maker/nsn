import type { FeedbackEnv } from '#feedback/app'
import type { Context } from 'hono'
import * as v from 'valibot'

/** Reads a JSON body with `schema`, so malformed JSON and a wrong shape fail the same way. */
export async function readJSON<TSchema extends v.GenericSchema>(
  c: Context<FeedbackEnv>,
  schema: TSchema
): Promise<v.InferOutput<TSchema> | null> {
  const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), schema), await c.req.text())
  return parsed.success ? parsed.output : null
}

/**
 * Counts the request against `limiter`, keyed by the client address Cloudflare reports. The
 * address lives only in the limiter's memory; nothing here stores or forwards it.
 */
export async function withinLimit(c: Context<FeedbackEnv>, limiter: RateLimit): Promise<boolean> {
  const key = c.req.header('cf-connecting-ip') ?? 'unknown'
  const { success } = await limiter.limit({ key })
  return success
}
