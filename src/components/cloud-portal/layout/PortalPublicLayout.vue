<script setup lang="ts">
import { useCloudPortalMessages } from '@open-pencil/vue'

import BrandMark from '@/components/brand/BrandMark.vue'
import { useDialogUI } from '@/components/ui/dialog/ui'
import { portalLayout } from '@/theme/cloud-portal/layout'

/**
 * A Cloud page for people who are signing in or answering a request: one card laid out as the
 * editor's dialogs are, with the page's buttons in its footer.
 */
const { host, heading, description } = defineProps<{
  host: string
  heading: string
  description?: string
}>()

const ui = portalLayout()
const dialog = useDialogUI()
const messages = useCloudPortalMessages()
</script>

<template>
  <div :class="ui.page()">
    <header :class="ui.bar()">
      <BrandMark variant="micro" decorative />
      <span :class="ui.barTitle()">{{ messages.productName }}</span>
      <span :class="ui.barHost()">{{ host }}</span>
    </header>
    <main :class="ui.center()">
      <section :class="ui.card()" :aria-label="heading">
        <header :class="dialog.header">
          <div :class="dialog.heading">
            <h1 :class="dialog.title">{{ heading }}</h1>
            <p v-if="description" :class="[dialog.description, 'mt-0.5']">{{ description }}</p>
          </div>
        </header>
        <div :class="ui.cardBody()">
          <slot name="icon" />
          <slot />
          <p v-if="$slots.footer" :class="ui.cardNote()">
            <slot name="footer" />
          </p>
        </div>
        <footer v-if="$slots.actions" :class="dialog.footer">
          <slot name="actions" />
        </footer>
      </section>
    </main>
  </div>
</template>
