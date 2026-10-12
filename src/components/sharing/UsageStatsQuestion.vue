<script setup lang="ts">
import { tv } from 'tailwind-variants'

import { useI18n } from '@open-pencil/vue'

import { setUsageStatsConsent, usageStatsConsent } from '@/app/telemetry'
import SettingsLink from '@/components/settings/layout/SettingsLink.vue'
import AppButton from '@/components/ui/button/AppButton.vue'
import { PRIVACY_URL } from '@/constants'
import theme from '@/theme/sharing/question'

const { source, framed = false } = defineProps<{
  /** Where the question is asked: on the welcome screen or in the later prompt. */
  source: 'welcome' | 'prompt'
  framed?: boolean
}>()
const { diagnostics } = useI18n()
const styles = tv(theme)({ framed })
</script>

<template>
  <section :class="styles.root()" data-test-id="usage-stats-question">
    <h3 :class="styles.heading()">{{ diagnostics.sharingQuestionTitle }}</h3>
    <p :class="styles.text()">{{ diagnostics.sharingQuestionDescription }}</p>
    <SettingsLink :href="PRIVACY_URL">{{ diagnostics.sharingDetails }}</SettingsLink>
    <p v-if="usageStatsConsent !== 'unset'" :class="styles.answer()" role="status">
      {{
        usageStatsConsent === 'granted'
          ? diagnostics.sharingQuestionAccepted
          : diagnostics.sharingQuestionDeclined
      }}
    </p>
    <div v-else :class="styles.actions()">
      <AppButton variant="outline" @click="setUsageStatsConsent(false, source)">
        {{ diagnostics.sharingQuestionDecline }}
      </AppButton>
      <AppButton color="primary" variant="solid" @click="setUsageStatsConsent(true, source)">
        {{ diagnostics.sharingQuestionAccept }}
      </AppButton>
    </div>
  </section>
</template>
