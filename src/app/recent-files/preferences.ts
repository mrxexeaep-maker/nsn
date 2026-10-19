import { computed } from 'vue'

import { appPreferences } from '@/app/settings/preferences/store'

import { resolveRecentFilesLimit } from './limit'

export const recentFilesLimit = computed({
  get: () => resolveRecentFilesLimit(appPreferences.value.files.recentLimit),
  set: (value: number) => {
    appPreferences.value = {
      ...appPreferences.value,
      files: { ...appPreferences.value.files, recentLimit: resolveRecentFilesLimit(value) }
    }
  }
})
