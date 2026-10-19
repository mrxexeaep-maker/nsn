<script setup lang="ts">
import { useFileMessages, useSceneComputed } from '@open-pencil/vue'

import { useEditorStore } from '@/app/editor/active-store'
import AppAlert from '@/components/ui/feedback/AppAlert.vue'

const store = useEditorStore()
const files = useFileMessages()
const count = useSceneComputed(
  () => [...store.graph.variables.values()].filter((variable) => variable.unresolved).length
)
</script>

<template>
  <AppAlert
    v-if="count > 0"
    tone="warning"
    :heading="files.expressionWarningHeading"
    :description="files.expressionWarningDescription({ count })"
  />
</template>
