import { useObjectUrl } from '@vueuse/core'
import { shallowRef, watch, type MaybeRefOrGetter, toValue } from 'vue'

import { useEditorStore } from '@/app/editor/active-store'

/** The stored image an image fill names, as a URL to show and its size in pixels. */
export function useImageFill(hash: MaybeRefOrGetter<string | undefined>) {
  const store = useEditorStore()
  const blob = shallowRef<Blob | null>(null)
  const url = useObjectUrl(blob)
  const size = shallowRef<{ width: number; height: number } | null>(null)

  watch(
    () => toValue(hash),
    (name) => {
      const data = name ? store.getImage(name) : undefined
      // A copy owns a plain ArrayBuffer, which a Blob takes where shared memory is not allowed.
      blob.value = data ? new Blob([data.slice()]) : null
    },
    { immediate: true }
  )
  watch(blob, async (current) => {
    size.value = null
    if (!current) return
    const bitmap = await createImageBitmap(current)
    if (blob.value === current) size.value = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
  })

  return { url, size }
}
