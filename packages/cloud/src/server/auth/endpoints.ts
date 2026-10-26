import type { passkey } from '@better-auth/passkey'
import type * as BetterAuthEndpoints from 'better-auth/api'
import type { deviceAuthorization, twoFactor } from 'better-auth/plugins'

/** Where Better Auth answers under the Cloud server. */
export const AUTH_BASE_PATH = '/api/auth'

/** The path an endpoint declares, whether the library exports it built or as a factory. */
type PathOf<Endpoint> = Endpoint extends { path: infer Path extends string }
  ? Path
  : Endpoint extends (...args: never) => { path: infer Path extends string }
    ? Path
    : never
type Paths<Endpoints, Names extends keyof Endpoints> = {
  readonly [Name in Names]: PathOf<Endpoints[Name]>
}

type CoreEndpoints = typeof BetterAuthEndpoints
type TwoFactorEndpoints = ReturnType<typeof twoFactor>['endpoints']
type PasskeyEndpoints = ReturnType<typeof passkey>['endpoints']
type DeviceEndpoints = ReturnType<typeof deviceAuthorization>['endpoints']

type AuthEndpoints = Paths<
  CoreEndpoints,
  | 'accountInfo'
  | 'callbackOAuth'
  | 'changeEmail'
  | 'changePassword'
  | 'deleteUser'
  | 'getAccessToken'
  | 'linkSocialAccount'
  | 'listSessions'
  | 'listUserAccounts'
  | 'refreshToken'
  | 'requestPasswordReset'
  | 'revokeOtherSessions'
  | 'revokeSession'
  | 'revokeSessions'
  | 'sendVerificationEmail'
  | 'signInEmail'
  | 'signInSocial'
  | 'signUpEmail'
  | 'unlinkAccount'
  | 'updateUser'
  | 'verifyEmail'
> &
  Paths<
    TwoFactorEndpoints,
    | 'disableTwoFactor'
    | 'enableTwoFactor'
    | 'generateBackupCodes'
    | 'getTOTPURI'
    | 'verifyBackupCode'
    | 'verifyTOTP'
  > &
  Paths<
    PasskeyEndpoints,
    | 'deletePasskey'
    | 'generatePasskeyRegistrationOptions'
    | 'listPasskeys'
    | 'updatePasskey'
    | 'verifyPasskeyAuthentication'
    | 'verifyPasskeyRegistration'
  > &
  Paths<DeviceEndpoints, 'deviceApprove' | 'deviceCode' | 'deviceDeny' | 'deviceToken'>

/**
 * The Better Auth endpoints Cloud acts on, by name. Each path must be the one the library declares
 * for that endpoint, so a renamed or removed endpoint fails the type check instead of silently no
 * longer matching.
 */
export const AUTH_ENDPOINTS: AuthEndpoints = {
  accountInfo: '/account-info',
  callbackOAuth: '/callback/:id',
  changeEmail: '/change-email',
  changePassword: '/change-password',
  deleteUser: '/delete-user',
  getAccessToken: '/get-access-token',
  linkSocialAccount: '/link-social',
  listSessions: '/list-sessions',
  listUserAccounts: '/list-accounts',
  refreshToken: '/refresh-token',
  requestPasswordReset: '/request-password-reset',
  revokeOtherSessions: '/revoke-other-sessions',
  revokeSession: '/revoke-session',
  revokeSessions: '/revoke-sessions',
  sendVerificationEmail: '/send-verification-email',
  signInEmail: '/sign-in/email',
  signInSocial: '/sign-in/social',
  signUpEmail: '/sign-up/email',
  unlinkAccount: '/unlink-account',
  updateUser: '/update-user',
  verifyEmail: '/verify-email',
  disableTwoFactor: '/two-factor/disable',
  enableTwoFactor: '/two-factor/enable',
  generateBackupCodes: '/two-factor/generate-backup-codes',
  getTOTPURI: '/two-factor/get-totp-uri',
  verifyBackupCode: '/two-factor/verify-backup-code',
  verifyTOTP: '/two-factor/verify-totp',
  deletePasskey: '/passkey/delete-passkey',
  generatePasskeyRegistrationOptions: '/passkey/generate-register-options',
  listPasskeys: '/passkey/list-user-passkeys',
  updatePasskey: '/passkey/update-passkey',
  verifyPasskeyAuthentication: '/passkey/verify-authentication',
  verifyPasskeyRegistration: '/passkey/verify-registration',
  deviceApprove: '/device/approve',
  deviceCode: '/device/code',
  deviceDeny: '/device/deny',
  deviceToken: '/device/token'
}

export type AuthEndpointPath = AuthEndpoints[keyof AuthEndpoints]

/**
 * Whether `path`, as a hook context or request has it, is `endpoint`'s. Hooks see the declared
 * pattern or the concrete path, so a `:param` segment matches any one segment.
 */
export function isAuthEndpoint(path: string | undefined, endpoint: AuthEndpointPath): boolean {
  if (!path) return false
  const actual = path.split('/')
  const expected = endpoint.split('/')
  return (
    actual.length === expected.length &&
    expected.every((segment, index) =>
      segment.startsWith(':') ? Boolean(actual[index]) : segment === actual[index]
    )
  )
}

/** The path a request for `endpoint` arrives at on the Cloud server. */
export function authRequestPath(endpoint: AuthEndpointPath): string {
  return `${AUTH_BASE_PATH}${endpoint}`
}
