/** Why a sign-in step did not go through, in terms a page or dialog can explain. */
export type CloudAuthFailure =
  | 'invalid-credentials'
  | 'email-not-verified'
  | 'password-too-short'
  | 'password-too-long'
  | 'invalid-link'
  | 'invalid-code'
  | 'rate-limited'
  | 'unavailable'

export type CloudAuthResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; failure: CloudAuthFailure }

type BetterAuthError = { code?: string; status?: number } | null | undefined

/** The failure a Better Auth error stands for; anything unknown can only be retried later. */
export function cloudAuthFailure(error: BetterAuthError): { ok: false; failure: CloudAuthFailure } {
  if (error?.status === 429) return { ok: false, failure: 'rate-limited' }
  switch (error?.code ?? '') {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return { ok: false, failure: 'invalid-credentials' }
    case 'EMAIL_NOT_VERIFIED':
      return { ok: false, failure: 'email-not-verified' }
    case 'PASSWORD_TOO_SHORT':
      return { ok: false, failure: 'password-too-short' }
    case 'PASSWORD_TOO_LONG':
      return { ok: false, failure: 'password-too-long' }
    case 'INVALID_TOKEN':
      return { ok: false, failure: 'invalid-link' }
    case 'INVALID_CODE':
    case 'INVALID_TWO_FACTOR_CODE':
    case 'INVALID_BACKUP_CODE':
      return { ok: false, failure: 'invalid-code' }
    default:
      return { ok: false, failure: 'unavailable' }
  }
}
