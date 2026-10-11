import type { FeedbackEnv, FeedbackServices } from '#feedback/app'
import { FEEDBACK_ROUTES, WaitlistSignupSchema } from '#feedback/contract'
import { createFeedbackDatabase } from '#feedback/db'
import { readJSON, withinLimit } from '#feedback/http/request'
import type { Context, Hono } from 'hono'
import * as v from 'valibot'

import { confirmationEmail } from './email'
import { actionPage, page } from './pages'
import { confirmSignup, leaveWaitlist, signUp } from './signup'
import { verifyTurnstile } from './turnstile'

const TokenSchema = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/))

const CONFIRM_PATH = `${FEEDBACK_ROUTES.waitlist}/confirm`
const LEAVE_PATH = `${FEEDBACK_ROUTES.waitlist}/leave`

function linkTo(c: Context<FeedbackEnv>, path: string, token: string): string {
  const url = new URL(path, c.req.url)
  url.searchParams.set('token', token)
  return url.href
}

function queryToken(c: Context<FeedbackEnv>): string | null {
  const parsed = v.safeParse(TokenSchema, c.req.query('token'))
  return parsed.success ? parsed.output : null
}

async function formToken(c: Context<FeedbackEnv>): Promise<string | null> {
  const form = await c.req.parseBody()
  const parsed = v.safeParse(TokenSchema, form.token)
  return parsed.success ? parsed.output : null
}

const invalidLink = () =>
  page('Link expired', 'This link is no longer valid. Sign up again on openpencil.dev.')

export function addWaitlistRoutes(app: Hono<FeedbackEnv>, services: FeedbackServices): void {
  // Every accepted sign-up gets the same answer, so the form never reveals who is on the list.
  app.post(FEEDBACK_ROUTES.waitlist, async (c) => {
    if (!(await withinLimit(c, c.env.WAITLIST_LIMITER))) return c.body(null, 429)
    const signup = await readJSON(c, WaitlistSignupSchema)
    if (!signup) return c.body(null, 400)
    const human = await verifyTurnstile(services.fetch, {
      secret: c.env.TURNSTILE_SECRET,
      token: signup.turnstileToken,
      hostname: c.env.TURNSTILE_HOSTNAME
    })
    if (!human) return c.body(null, 403)
    const token = await signUp(createFeedbackDatabase(c.env.DB), signup, services.now())
    if (token) {
      await c.env.EMAIL.send({
        from: { name: 'OpenPencil', email: c.env.EMAIL_FROM },
        to: signup.email,
        ...(await confirmationEmail({
          confirmURL: linkTo(c, CONFIRM_PATH, token),
          leaveURL: linkTo(c, LEAVE_PATH, token)
        }))
      })
    }
    return c.body(null, 202)
  })

  app.get(CONFIRM_PATH, (c) => {
    const token = queryToken(c)
    if (!token) return c.html(invalidLink(), 404)
    return c.html(
      actionPage({
        title: 'Join the waitlist',
        message: 'Confirm your email to join the OpenPencil Cloud waitlist.',
        action: 'Confirm',
        token
      })
    )
  })

  app.post(CONFIRM_PATH, async (c) => {
    const token = await formToken(c)
    const db = createFeedbackDatabase(c.env.DB)
    if (!token || !(await confirmSignup(db, token, services.now()))) {
      return c.html(invalidLink(), 404)
    }
    return c.html(
      page("You're on the list", 'We will write when OpenPencil Cloud is ready for you.')
    )
  })

  app.get(LEAVE_PATH, (c) => {
    const token = queryToken(c)
    if (!token) return c.html(invalidLink(), 404)
    return c.html(
      actionPage({
        title: 'Leave the waitlist',
        message: 'Remove your email from the OpenPencil Cloud waitlist.',
        action: 'Remove my email',
        token
      })
    )
  })

  app.post(LEAVE_PATH, async (c) => {
    const token = await formToken(c)
    if (token) await leaveWaitlist(createFeedbackDatabase(c.env.DB), token)
    return c.html(page('Removed', 'Your email is no longer on the waitlist.'))
  })
}
