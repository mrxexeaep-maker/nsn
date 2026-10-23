import { IS_TAURI } from '@open-pencil/core/constants'
import type { ReadDocumentInput } from '@open-pencil/core/io'

/**
 * Reads the files a document opened from `path` names relative to itself, such as a `.pen`
 * document's images, from the document's folder only. A browser has no path to read beside, so
 * documents opened there get none.
 */
export function documentAssetReader(path: string | undefined): ReadDocumentInput['readAsset'] {
  if (!IS_TAURI || !path) return undefined
  return async (relative) => {
    const [{ dirname, resolve, sep }, { readFile }] = await Promise.all([
      import('@tauri-apps/api/path'),
      import('@tauri-apps/plugin-fs')
    ])
    const folder = await dirname(path)
    const target = await resolve(folder, relative)
    if (!target.startsWith(folder + sep())) return null
    return readFile(target).catch(() => null)
  }
}
