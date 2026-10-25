import { readFileSync } from 'node:fs'

import type { Plugin } from 'vite'

/** Where a page wants the splash: inside its mount element, which the app replaces. */
const PLACEHOLDER = '<!-- boot-splash -->'

const MARKUP = `<div id="boot-splash" role="status" aria-label="Loading">
        <img src="/brand/app-icon.svg" width="40" height="40" alt="" />
        <div class="bar"></div>
      </div>`

/**
 * Starts the splash in the theme the page will take (`src/app/settings/theme.ts`), so the
 * page does not change colour as its script loads; `auto` leaves it to the system.
 */
function themeScript(storageKey: string): string {
  return `try {
  const theme = localStorage.getItem(${JSON.stringify(storageKey)})
  if (theme !== 'auto') document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'
} catch {}`
}

/**
 * Draws one boot splash, inlined so it shows before anything loads, on every page that marks
 * where it goes with `<!-- boot-splash -->`: the editor, a Cloud server's pages, and the metrics
 * dashboard, which would otherwise each keep a copy that drifts from the others.
 */
export function bootSplashPlugin({ themeStorageKey }: { themeStorageKey: string }): Plugin {
  const style = readFileSync(new URL('splash.css', import.meta.url), 'utf8')
  const script = themeScript(themeStorageKey)
  return {
    name: 'open-pencil-boot-splash',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!html.includes(PLACEHOLDER)) return html
        return {
          html: html.replace(PLACEHOLDER, MARKUP),
          tags: [
            { tag: 'style', children: style, injectTo: 'head' },
            { tag: 'script', children: script, injectTo: 'head' }
          ]
        }
      }
    }
  }
}
