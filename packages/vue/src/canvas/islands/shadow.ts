import { onMounted, shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

/**
 * A container inside a shadow root of `host`, created once `host` mounts, with `css` as the
 * shadow root's only styles, kept current as it changes: the app's styles do not reach into
 * it, nor its styles out.
 */
export function useShadowContainer(
  host: Readonly<Ref<HTMLElement | null>>,
  css: MaybeRefOrGetter<string>
) {
  const container = shallowRef<HTMLElement | null>(null)
  onMounted(() => {
    if (!host.value) return
    const shadow = host.value.attachShadow({ mode: 'open' })
    const sheet = new CSSStyleSheet()
    watch(
      () => toValue(css),
      (value) => sheet.replaceSync(value),
      { immediate: true }
    )
    shadow.adoptedStyleSheets = [sheet]
    const mount = document.createElement('div')
    shadow.append(mount)
    container.value = mount
  })
  return container
}
