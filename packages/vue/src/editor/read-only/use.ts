import { computed, shallowRef } from 'vue'

import { useEditor } from '#vue/editor/context'
import { useEditorEvent } from '#vue/editor/events/use'

/** Whether the document is open read-only, following `setReadOnly` on the editor. */
export function useDocumentReadOnly() {
  const editor = useEditor()
  // A change counter, not the flag itself: an editor that follows the active document must answer
  // for the document that is active now.
  const version = shallowRef(0)
  useEditorEvent('document:read-only-changed', () => {
    version.value++
  })
  return computed(() => version.value >= 0 && editor.state.readOnly)
}
