<script setup lang="ts">
import PortalPublicLayout from '../layout/PortalPublicLayout.vue'

/** A Cloud page that tells the person where they stand and what to do next. */
const {
  host,
  heading,
  description,
  tone = 'neutral'
} = defineProps<{
  host: string
  heading: string
  description: string
  tone?: 'neutral' | 'success' | 'waiting'
}>()
</script>

<template>
  <PortalPublicLayout :host="host" :heading="heading">
    <template #icon>
      <div class="flex items-start gap-3">
        <span
          class="flex size-10 shrink-0 items-center justify-center rounded-full bg-panel-field text-muted data-[tone=success]:bg-success/10 data-[tone=success]:text-success"
          :data-tone="tone"
        >
          <slot name="icon" />
        </span>
        <p class="pt-1 text-xs leading-relaxed text-muted">{{ description }}</p>
      </div>
    </template>
    <slot />
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </PortalPublicLayout>
</template>
