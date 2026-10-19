<script setup lang="ts">
import { ref } from 'vue'

import { useCommonMessages, useFileMessages, useSceneComputed } from '@open-pencil/vue'

import { useEditorStore } from '@/app/editor/active-store'
import IconButton from '@/components/ui/button/IconButton.vue'
import AppAlert from '@/components/ui/feedback/AppAlert.vue'

const store = useEditorStore()
const files = useFileMessages()
const common = useCommonMessages()
const dismissed = ref(false)
const count = useSceneComputed(
  () => [...store.graph.variables.values()].filter((variable) => variable.unresolved).length
)
</script>

<template>
  <AppAlert
    v-if="count > 0 && !dismissed"
    tone="warning"
    :heading="files.expressionWarningHeading"
    :description="files.expressionWarningDescription({ count })"
    :ui="{ root: 'relative', content: 'pr-6', actions: 'absolute right-2 top-2 mt-0' }"
  >
    <template #actions>
      <IconButton :label="common.close" @click="dismissed = true">
        <icon-lucide-x class="size-3.5" />
      </IconButton>
    </template>
  </AppAlert>
</template>
