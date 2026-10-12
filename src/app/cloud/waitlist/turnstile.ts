import { useIntersectionObserver, useScriptTag } from '@vueuse/core'
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
 * form comes into view, so pages that never show it never fetch it, and the widget stays
 * invisible unless Turnstile needs the visitor to click. It works only on the sites the feedback
 * service accepts; anywhere else, such as a local dev server, it reports `unavailable`.
 */
export function useTurnstile(container: Readonly<Ref<HTMLElement | null>>) {
  const state = ref<TurnstileState>('waiting')
  const token = ref<string | null>(null)
  let widget: string | undefined
  let waiting: ((token: string | null) => void)[] = []

  function settle(value: string | null): void {
    for (const resolve of waiting) resolve(value)
    waiting = []
  }

  function render(): void {
    const api = window.turnstile
    const element = container.value
    if (!api || !element || widget !== undefined) return
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
        state.value = 'unavailable'
        settle(null)
        return true
      }
    })
  }

  const { load } = useScriptTag(TURNSTILE_SCRIPT, render, { manual: true })
  const { stop } = useIntersectionObserver(container, (entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    stop()
    // A script another form already loaded resolves at once; rendering is idempotent.
    load()
      .then(render)
      .catch(() => {
        state.value = 'unavailable'
        settle(null)
      })
  })

  /** A token for one sign-up: the one held, or the next Turnstile issues; null if it cannot. */
  function nextToken(): Promise<string | null> {
    if (token.value) return Promise.resolve(token.value)
    if (state.value === 'unavailable') return Promise.resolve(null)
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
