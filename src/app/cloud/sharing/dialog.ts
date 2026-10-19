import { ref } from 'vue'

/** The open document's Cloud share dialog, opened from the Share button or its status. */
export const cloudShareOpen = ref(false)

/** Opens the active Cloud document's share dialog, as the mobile Share button does. */
export function openCloudShare(): void {
  cloudShareOpen.value = true
}
