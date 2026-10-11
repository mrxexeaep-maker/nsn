import type { FeedbackServices } from '#feedback/app'
import * as v from 'valibot'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

const SiteverifySchema = v.object({
  success: v.boolean(),
  hostname: v.optional(v.string())
})

/** Whether Turnstile accepts the form's token for our site; the client address is not sent. */
export async function verifyTurnstile(
  fetcher: FeedbackServices['fetch'],
  { secret, token, hostname }: { secret: string; token: string; hostname: string }
): Promise<boolean> {
  const response = await fetcher(SITEVERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token })
  }).catch(() => null)
  if (!response?.ok) return false
  const result = v.safeParse(
    v.pipe(v.string(), v.parseJson(), SiteverifySchema),
    await response.text()
  )
  return result.success && result.output.success && result.output.hostname === hostname
}
