import { computed, ref } from 'vue'

import { randomHex } from '@open-pencil/scene-graph/random'
import { locale } from '@open-pencil/vue'

import { appPreferences, updateSharingPreferences } from '@/app/settings/preferences/store'

import { FEEDBACK_ENABLED } from './config'
import { sharingClient } from './instance'
import { sharingDisabledByEnvironment, sharingState } from './state'

/** Whether this build asks about usage stats at all: official builds, environment permitting. */
const askable = ref(false)

/** The standalone question, for people who never saw it on the welcome screen. */
export const usageStatsPromptOpen = ref(false)

export const usageStatsConsent = computed(() => appPreferences.value.sharing.usageStats)

/** Starting to share makes a new random ID; stopping deletes it and anything queued. */
export function setUsageStatsConsent(granted: boolean): void {
  updateSharingPreferences({ usageStats: granted ? 'granted' : 'denied' })
  sharingState.value = {
    ...sharingState.value,
    installId: granted ? (sharingState.value.installId ?? randomHex(16)) : null
  }
  usageStatsPromptOpen.value = false
  if (granted) sharingClient.trackUsage({ name: 'app_opened', locale: locale.get() })
  else sharingClient.discardPendingUsage()
}

/** Whether the welcome screen should ask, decided before it opens. */
export function shouldAskUsageStats(): boolean {
  return askable.value && usageStatsConsent.value === 'unset'
}

/**
 * Asks with the standalone prompt when the question is still open and the welcome screen did
 * not just ask it, so an install that skipped the welcome is asked on its next launch.
 */
export function offerUsageStatsPrompt({ welcomeShown }: { welcomeShown: boolean }): void {
  if (welcomeShown || !shouldAskUsageStats()) return
  usageStatsPromptOpen.value = true
}

export async function resolveUsageStatsQuestion(): Promise<void> {
  askable.value = FEEDBACK_ENABLED && !(await sharingDisabledByEnvironment())
}
