import { appPreferences } from '@/app/settings/preferences/store'

import { currentBuild } from './build'
import { createSharingClient } from './client'
import { FEEDBACK_ENABLED, feedbackURL } from './config'
import { sharingDisabledByEnvironment, sharingState } from './state'

/** The app's one sharing client, sending to the feedback service when the build allows. */
export const sharingClient = createSharingClient({
  enabled: FEEDBACK_ENABLED,
  preferences: () => appPreferences.value.sharing,
  state: sharingState,
  build: currentBuild,
  disabledByEnvironment: sharingDisabledByEnvironment,
  async post(route, body, { keepalive }) {
    const response = await fetch(feedbackURL(route), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive
    }).catch(() => null)
    return response?.ok ?? false
  }
})
