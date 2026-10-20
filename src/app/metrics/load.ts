import { ref, shallowRef, watch, type Ref } from 'vue'

import { createFeedbackClient } from '@open-pencil/feedback/client'
import type { MetricsSnapshot } from '@open-pencil/feedback/contract'

import type { MetricsRange } from './range'

/**
 * The dashboard's numbers for the chosen range, from the feedback Worker that serves the page.
 * A newer request wins over one still in flight, and the last numbers stay on screen while the
 * next ones load. A failed request keeps them too: when Access's session has run out, the API
 * redirects to the login page and the request fails, and reloading signs in again.
 */
export function useMetricsSnapshot(range: Ref<MetricsRange>) {
  const client = createFeedbackClient({ origin: globalThis.location.origin })
  const snapshot = shallowRef<MetricsSnapshot>()
  const loading = ref(false)
  const failed = ref(false)
  let latest = 0

  async function load() {
    const request = ++latest
    loading.value = true
    try {
      const response = await client.admin.api.snapshot.$get({
        query: { start: range.value.start, end: range.value.end }
      })
      if (request !== latest) return
      if (response.status !== 200) throw new Error(`The metrics API answered ${response.status}`)
      snapshot.value = await response.json()
      failed.value = false
    } catch (error) {
      if (request !== latest) return
      console.warn('Metrics could not load', error)
      failed.value = true
    } finally {
      if (request === latest) loading.value = false
    }
  }

  watch(range, load, { immediate: true })
  return { snapshot, loading, failed, refresh: load }
}
