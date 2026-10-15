<script setup lang="ts">
import {
  saveToChosenDestination,
  saveToDestination,
  saveToDestinations,
  saveToName,
  saveToOpen,
  saveToState
} from '@/app/storage/save-to'

import SaveToDialog from './SaveToDialog.vue'

/** The Save to dialog, driven by the app's save flow for whichever tab opened it. */
</script>

<template>
  <SaveToDialog
    v-model:open="saveToOpen"
    v-model:name="saveToName"
    v-model:destination="saveToDestination"
    :destinations="saveToDestinations"
    :state="saveToState"
    @save="saveToChosenDestination"
    @cancel="saveToOpen = false"
  />
</template>
