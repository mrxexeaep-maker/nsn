/**
 * The stored theme setting, shared by the editor, the Cloud server's pages, and the boot splash
 * every page draws before its script loads (`vite/boot-splash`), so they all start in one theme.
 * It depends on nothing, since the Vite config reads it too.
 */
export const APP_THEMES = ['dark', 'light', 'auto'] as const
export type AppTheme = (typeof APP_THEMES)[number]

export const THEME_STORAGE_KEY = 'open-pencil:theme'
export const DEFAULT_THEME: AppTheme = 'dark'

/** The theme in effect; a stored value that is not a theme reads as the default dark. */
export function resolveAppTheme(setting: unknown, prefersDark: boolean): 'dark' | 'light' {
  if (setting === 'auto') return prefersDark ? 'dark' : 'light'
  return setting === 'light' ? 'light' : 'dark'
}
