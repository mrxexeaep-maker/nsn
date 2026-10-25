import { signInMethod } from '#cloud/server/auth/activity'
import type { BetterAuthPlugin } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'

import type { UserPictureService } from './service'

/**
 * Keeps the picture a Google account gave the person once a sign-in issues their session, so pages
 * show the server's copy and never load it from Google. Accounts made before the server kept
 * pictures move over the next time they sign in this way.
 */
export function providerPictures(pictures: UserPictureService): BetterAuthPlugin {
  return {
    id: 'openpencil-provider-pictures',
    hooks: {
      after: [
        {
          matcher: (context) => signInMethod(context) !== null,
          handler: createAuthMiddleware(async (context) => {
            const user = context.context.newSession?.user
            if (user?.image && !pictures.served(user.image)) {
              await pictures.copyFromProvider(user.id, user.image)
            }
          })
        }
      ]
    }
  }
}
