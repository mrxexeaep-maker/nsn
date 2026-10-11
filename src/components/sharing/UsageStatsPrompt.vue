<script setup lang="ts">
import { tv } from 'tailwind-variants'

import { usageStatsPromptOpen } from '@/app/telemetry'
import theme from '@/theme/sharing/prompt'

import UsageStatsQuestion from './UsageStatsQuestion.vue'

const styles = tv(theme)()
</script>

<template>
  <aside v-if="usageStatsPromptOpen" :class="styles.root()" data-test-id="usage-stats-prompt">
    <UsageStatsQuestion />
  </aside>
</template>
