import { createFeedbackClient } from '@open-pencil/feedback/client'

import { appPreferences } from '@/app/settings/preferences/store'

import { currentBuild } from './build'
import { createSharingClient } from './client'
import { FEEDBACK_ENABLED } from './config'
import { sharingDisabledByEnvironment, sharingState } from './state'

/**
 * The browser's own `fetch`, taken when the app loads. Core's web-font loader swaps the global
 * `fetch` while providers load and refuses hosts other than font CDNs, which would drop a ping
 * sent at startup (`browser-fetch.ts` takes it the same way).
 */
const feedback = createFeedbackClient({ fetch: globalThis.fetch.bind(globalThis) })

async function accepted(request: Promise<Response>): Promise<boolean> {
  const response = await request.catch(() => null)
  return response?.ok ?? false
}

/** The app's one sharing client, sending to the feedback service when the build allows. */
export const sharingClient = createSharingClient({
  enabled: FEEDBACK_ENABLED,
  preferences: () => appPreferences.value.sharing,
  state: sharingState,
  build: currentBuild,
  disabledByEnvironment: sharingDisabledByEnvironment,
  send: {
    ping: (ping) => accepted(feedback.ping.$post({ json: ping })),
    ingest: (batch, { keepalive }) =>
      accepted(feedback.ingest.$post({ json: batch }, { init: { keepalive } }))
  }
})
