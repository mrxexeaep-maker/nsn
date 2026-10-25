import { describe, expect, test } from 'bun:test'

import {
  accountAuthenticationConfig,
  accountAuthenticationRequest,
  createAccountAuthenticationFixture,
  createVerifiedCredentialAccount
} from '#cloud-tests/helpers/account-authentication'
import { pngHeader } from '#cloud-tests/helpers/pictures'
import { responseJSON } from '#cloud-tests/helpers/response'
import {
  accountSecurityErrorResponseSchema,
  cloudPictureResponseSchema,
  cloudProfileResponseSchema
} from '#cloud/contract'
import { createUserPictures } from '#cloud/server/pictures'
import { utf8ToBytes } from '@noble/hashes/utils.js'
import { fromUint8Array } from 'js-base64'

const PASSWORD = 'a sufficiently long password'
const GOOGLE_PICTURE = 'https://lh3.googleusercontent.com/a/picture=s96-c'

type Fixture = Awaited<ReturnType<typeof createAccountAuthenticationFixture>>

async function profileImage(fixture: Fixture, cookie: string): Promise<string | null> {
  const response = await fixture.app.fetch(
    accountAuthenticationRequest('/api/account/profile', undefined, cookie)
  )
  return (await responseJSON(response, cloudProfileResponseSchema)).profile.image
}

function upload(fixture: Fixture, bytes: Uint8Array, cookie?: string) {
  return fixture.app.fetch(
    accountAuthenticationRequest(
      '/api/account/profile/picture',
      { data: fromUint8Array(bytes) },
      cookie,
      { method: 'PUT' }
    )
  )
}

describe('account pictures', () => {
  test('serves an uploaded picture from its own address until it is removed', async () => {
    const fixture = await createAccountAuthenticationFixture()
    try {
      const account = await createVerifiedCredentialAccount(fixture, {
        email: 'picture@example.com',
        name: 'Picture Person',
        password: PASSWORD,
        approved: true
      })
      const picture = pngHeader(256, 256)
      const uploaded = await upload(fixture, picture, account.sessionCookie)
      expect(uploaded.status).toBe(200)
      const { image } = await responseJSON(uploaded, cloudPictureResponseSchema)
      expect(image).toStartWith(
        `${accountAuthenticationConfig.publicURL}/api/pictures/${account.userId}/`
      )
      expect(await profileImage(fixture, account.sessionCookie)).toBe(image)

      const served = await fixture.app.fetch(new Request(image))
      expect(served.status).toBe(200)
      expect(served.headers.get('content-type')).toBe('image/png')
      expect(served.headers.get('cache-control')).toContain('immutable')
      expect(served.headers.get('x-content-type-options')).toBe('nosniff')
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(picture)

      const elsewhere = [
        `/api/pictures/${account.userId}/0000000000000000`,
        `/api/pictures/not-an-account/${image.slice(-16)}`
      ]
      for (const path of elsewhere) {
        const missing = await fixture.app.fetch(accountAuthenticationRequest(path))
        expect(missing.status).toBe(404)
      }

      const removed = await fixture.app.fetch(
        accountAuthenticationRequest(
          '/api/account/profile/picture',
          undefined,
          account.sessionCookie,
          {
            method: 'DELETE'
          }
        )
      )
      expect(removed.status).toBe(200)
      expect(await profileImage(fixture, account.sessionCookie)).toBeNull()
      expect((await fixture.app.fetch(new Request(image))).status).toBe(404)
    } finally {
      await fixture.close()
    }
  })

  test('refuses files that are not a picture the server keeps', async () => {
    const fixture = await createAccountAuthenticationFixture()
    try {
      const account = await createVerifiedCredentialAccount(fixture, {
        email: 'refused@example.com',
        name: 'Refused Person',
        password: PASSWORD,
        approved: true
      })
      for (const bytes of [utf8ToBytes('<svg/>'), pngHeader(4096, 4096)]) {
        const refused = await upload(fixture, bytes, account.sessionCookie)
        expect(refused.status).toBe(400)
        expect((await responseJSON(refused, accountSecurityErrorResponseSchema)).error.code).toBe(
          'picture_invalid'
        )
      }
      expect(await profileImage(fixture, account.sessionCookie)).toBeNull()
      expect((await upload(fixture, pngHeader(256, 256))).status).toBe(401)
    } finally {
      await fixture.close()
    }
  })

  test("keeps a linked account's picture instead of linking to it", async () => {
    const fixture = await createAccountAuthenticationFixture()
    try {
      const account = await createVerifiedCredentialAccount(fixture, {
        email: 'google@example.com',
        name: 'Google Person',
        password: PASSWORD,
        approved: true
      })
      const picture = pngHeader(96, 96)
      const requested: string[] = []
      const pictures = createUserPictures(fixture.database, {
        publicURL: accountAuthenticationConfig.publicURL,
        fetch: async (input) => {
          requested.push(String(input))
          return new Response(picture)
        }
      })
      const setImage = (image: string) =>
        fixture.database
          .updateTable('user')
          .set({ image })
          .where('id', '=', account.userId)
          .execute()

      await setImage(GOOGLE_PICTURE)
      await pictures.copyFromProvider(account.userId, GOOGLE_PICTURE)
      expect(requested).toEqual([GOOGLE_PICTURE])
      const kept = await profileImage(fixture, account.sessionCookie)
      expect(kept).toStartWith(`${accountAuthenticationConfig.publicURL}/api/pictures/`)
      const served = await fixture.app.fetch(new Request(kept ?? ''))
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(picture)

      // A kept picture is not fetched again.
      await pictures.copyFromProvider(account.userId, kept ?? '')
      expect(requested).toHaveLength(1)

      // One that cannot be kept leaves initials rather than a link to another service.
      const failing = createUserPictures(fixture.database, {
        publicURL: accountAuthenticationConfig.publicURL,
        fetch: async () => new Response('not found', { status: 404 })
      })
      await setImage(GOOGLE_PICTURE)
      await failing.copyFromProvider(account.userId, GOOGLE_PICTURE)
      expect(await profileImage(fixture, account.sessionCookie)).toBeNull()
      await setImage('http://pictures.example.com/plain.png')
      await pictures.copyFromProvider(account.userId, 'http://pictures.example.com/plain.png')
      expect(await profileImage(fixture, account.sessionCookie)).toBeNull()
      expect(requested).toHaveLength(1)
    } finally {
      await fixture.close()
    }
  })
})
