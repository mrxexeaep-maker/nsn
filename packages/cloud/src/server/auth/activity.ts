import type { CloudAccountSession, CloudSignIn, CloudSignInMethod } from '#cloud/contract'
import type { CloudDatabase } from '#cloud/server/db'
import { dateString } from '#cloud/server/sharing/contracts'
import type { Kysely } from 'kysely'

import type { AuthenticationEmailService } from './email'
import { describeUserAgent } from './user-agent'

/** The newest sign-ins an account's history shows. */
const SIGN_IN_HISTORY_LIMIT = 50

/**
 * How a Better Auth endpoint that just set a session cookie signed someone in, or null when it
 * only refreshed or changed a session that already existed.
 */
export function signInMethod(path: string): CloudSignInMethod | null {
  const endpoint = path.replace(/^\/api\/auth/, '')
  if (endpoint === '/sign-in/email') return 'password'
  if (endpoint === '/passkey/verify-authentication') return 'passkey'
  if (endpoint.startsWith('/two-factor/verify-')) return 'two-step'
  if (endpoint === '/verify-email') return 'email-link'
  if (endpoint === '/device/token') return 'desktop'
  const callback = /^\/(?:callback|oauth2\/callback)\/([^/]+)$/.exec(endpoint)?.[1]
  if (callback === 'google' || callback === 'apple') return callback
  if (callback || endpoint === '/sign-in/social') return 'other'
  return null
}

/** The session token a response hands its client: the bearer header, or the device grant's body. */
export async function issuedSessionToken(response: Response, path: string): Promise<string | null> {
  const header = response.headers.get('set-auth-token')
  if (header) return header.split('.', 1)[0] ?? null
  if (!path.endsWith('/device/token') || !response.ok) return null
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null)
  if (typeof body !== 'object' || body === null || !('access_token' in body)) return null
  return typeof body.access_token === 'string' ? body.access_token : null
}

/**
 * Where an account signs in from. Each new session is written down with how it was made, so the
 * account's owner can read its sign-ins and sessions, and a sign-in from an address the account
 * never used before is told to its email; the first sign-in an account makes is not.
 */
export function createSignInActivity(
  database: Kysely<CloudDatabase>,
  email?: AuthenticationEmailService
) {
  return {
    async record(token: string, method: CloudSignInMethod): Promise<void> {
      const session = await database
        .selectFrom('session')
        .innerJoin('user', 'user.id', 'session.userId')
        .select([
          'session.id',
          'session.userId',
          'session.ipAddress',
          'session.userAgent',
          'user.email',
          'user.name'
        ])
        .where('session.token', '=', token)
        .executeTakeFirst()
      if (!session) return
      const recorded = await database
        .selectFrom('cloudSignIn')
        .select('id')
        .where('sessionId', '=', session.id)
        .executeTakeFirst()
      if (recorded) return
      const ipAddress = session.ipAddress || null
      const [known, earlier] = await Promise.all([
        ipAddress
          ? database
              .selectFrom('cloudSignIn')
              .select('id')
              .where('userId', '=', session.userId)
              .where('ipAddress', '=', ipAddress)
              .executeTakeFirst()
          : undefined,
        database
          .selectFrom('cloudSignIn')
          .select('id')
          .where('userId', '=', session.userId)
          .executeTakeFirst()
      ])
      const id = crypto.randomUUID()
      const signedInAt = new Date()
      await database
        .insertInto('cloudSignIn')
        .values({
          id,
          userId: session.userId,
          sessionId: session.id,
          method,
          ipAddress,
          userAgent: session.userAgent || null,
          createdAt: signedInAt
        })
        .execute()
      if (!email || !earlier || known || !ipAddress) return
      await email.sendNewSignIn({
        email: session.email,
        name: session.name,
        signInId: id,
        signedInAt,
        ipAddress,
        ...describeUserAgent(session.userAgent),
        desktop: method === 'desktop'
      })
    },

    /** The account's sessions that have not expired, newest activity first. */
    async sessions(userId: string, currentSessionId: string): Promise<CloudAccountSession[]> {
      const rows = await database
        .selectFrom('session')
        .leftJoin('cloudSignIn', 'cloudSignIn.sessionId', 'session.id')
        .select([
          'session.id',
          'session.ipAddress',
          'session.userAgent',
          'session.createdAt',
          'session.updatedAt',
          'session.expiresAt',
          'cloudSignIn.method'
        ])
        .where('session.userId', '=', userId)
        .where('session.expiresAt', '>', new Date())
        .orderBy('session.updatedAt', 'desc')
        .execute()
      return rows.map((row) => ({
        id: row.id,
        current: row.id === currentSessionId,
        method: row.method ?? null,
        ipAddress: row.ipAddress || null,
        ...describeUserAgent(row.userAgent),
        createdAt: dateString(row.createdAt) ?? '',
        lastActiveAt: dateString(row.updatedAt) ?? '',
        expiresAt: dateString(row.expiresAt) ?? ''
      }))
    },

    async signIns(userId: string, limit = SIGN_IN_HISTORY_LIMIT): Promise<CloudSignIn[]> {
      const rows = await database
        .selectFrom('cloudSignIn')
        .select(['id', 'method', 'ipAddress', 'userAgent', 'createdAt'])
        .where('userId', '=', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .execute()
      return rows.map((row) => ({
        id: row.id,
        method: row.method,
        ipAddress: row.ipAddress,
        ...describeUserAgent(row.userAgent),
        createdAt: dateString(row.createdAt) ?? ''
      }))
    }
  }
}

export type SignInActivity = ReturnType<typeof createSignInActivity>
