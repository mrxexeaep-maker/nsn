import { useIntersectionObserver, useResizeObserver, useScriptTag } from '@vueuse/core'
import { onScopeDispose, ref, type Ref } from 'vue'

import { TURNSTILE_SITE_KEY, WAITLIST_TURNSTILE_ACTION } from '@open-pencil/feedback/contract'

/** The part of Cloudflare Turnstile's explicit-render API the waitlist form uses. */
export interface TurnstileAPI {
  render(container: HTMLElement, options: TurnstileOptions): string | undefined
  reset(widgetId: string): void
  remove(widgetId: string): void
}

interface TurnstileOptions {
  sitekey: string
  action: string
  appearance: 'always' | 'execute' | 'interaction-only'
  theme: 'auto' | 'light' | 'dark'
  callback(token: string): void
  'expired-callback'(): void
  /** Returning true tells Turnstile the error is handled, so it does not throw. */
  'error-callback'(): boolean
}

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export type TurnstileState = 'waiting' | 'ready' | 'unavailable'

/**
 * Cloudflare Turnstile for a waitlist form, rendered in `container`. The script loads once the
 * form comes into view, or when it is submitted before that, so pages that never show it never
 * fetch it. The widget stays invisible unless Turnstile needs the visitor to click, and is
 * scrolled into view when it does. It works only on the sites the feedback service accepts;
 * anywhere else, such as a local dev server, it reports `unavailable`.
 */
export function useTurnstile(container: Readonly<Ref<HTMLElement | null>>) {
  const state = ref<TurnstileState>('waiting')
  const token = ref<string | null>(null)
  let widget: string | undefined
  let started = false
  let rendered = false
  let waiting: ((token: string | null) => void)[] = []

  function settle(value: string | null): void {
    for (const resolve of waiting) resolve(value)
    waiting = []
  }

  /** Turnstile cannot run here: every sign-up waiting for a token gets none. */
  function unavailable(): void {
    state.value = 'unavailable'
    settle(null)
  }

  function render(): void {
    if (rendered) return
    rendered = true
    const api = window.turnstile
    const element = container.value
    if (!api || !element) {
      unavailable()
      return
    }
    widget = api.render(element, {
      sitekey: TURNSTILE_SITE_KEY,
      action: WAITLIST_TURNSTILE_ACTION,
      appearance: 'interaction-only',
      theme: 'auto',
      callback(issued) {
        token.value = issued
        state.value = 'ready'
        settle(issued)
      },
      'expired-callback'() {
        token.value = null
      },
      'error-callback'() {
        unavailable()
        return true
      }
    })
    // A widget that did not render reports no error, so nothing else would answer a sign-up.
    if (widget === undefined) unavailable()
  }

  const { load } = useScriptTag(TURNSTILE_SCRIPT, render, { manual: true })

  /** Loads Turnstile and renders the widget, once. */
  function start(): void {
    if (started) return
    started = true
    stop()
    // A script another form already loaded resolves at once; rendering happens once.
    load().then(render).catch(unavailable)
  }

  const { stop } = useIntersectionObserver(container, (entries) => {
    if (entries.some((entry) => entry.isIntersecting)) start()
  })

  // The widget takes room only to ask for a click, and grows as its check loads: bring it into
  // view then, so a check below the visible part of the page is not missed.
  useResizeObserver(container, (entries) => {
    if (entries.some((entry) => entry.contentRect.height > 0)) {
      container.value?.scrollIntoView({ block: 'nearest' })
    }
  })

  /**
   * A token for one sign-up: the one held, or the next Turnstile issues; null if it cannot. A
   * form submitted before it came into view starts Turnstile here.
   */
  function nextToken(): Promise<string | null> {
    if (token.value) return Promise.resolve(token.value)
    if (state.value === 'unavailable') return Promise.resolve(null)
    start()
    return new Promise((resolve) => {
      waiting.push(resolve)
    })
  }

  /** A token works once: after a sign-up sends it, the widget fetches the next. */
  function spend(): void {
    token.value = null
    if (widget !== undefined) window.turnstile?.reset(widget)
  }

  onScopeDispose(() => {
    stop()
    if (widget !== undefined) window.turnstile?.remove(widget)
    settle(null)
  })

  return { state, nextToken, spend }
}
