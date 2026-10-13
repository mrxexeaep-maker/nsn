import { useActiveElement } from '@vueuse/core'
import { computed, watch } from 'vue'
import type { ComputedRef } from 'vue'

import type { EditorStore } from '@/app/editor/active-store'
import { isInputElement } from '@/app/shell/keyboard/focus'

/**
 * Whether a text field in the page, not the canvas, has keyboard focus. The canvas text editor
 * types through a hidden textarea, so it counts as the canvas.
 *
 * The native menu follows it: Undo, Redo, and Select All become the OS's own items while a field
 * has focus, so they edit the field instead of the canvas.
 */
export function useTextFieldFocus(store: EditorStore): ComputedRef<boolean> {
  const activeElement = useActiveElement()
  const focused = computed(() => isInputElement(activeElement.value) && !store.state.editingTextId)

  watch(
    focused,
    (value) => {
      void import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('set_text_field_focus', { focused: value }))
        .catch((error: unknown) => {
          console.warn('[Menu] Failed to update the native edit items', error)
        })
    },
    { immediate: true }
  )

  return focused
}
