import { chmod, open, realpath, rename, stat, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { randomHex } from '@open-pencil/scene-graph/random'

export interface AtomicWriteOptions {
  /** The file's mode; an existing file otherwise keeps its own, and a new one gets the default. */
  mode?: number
  /**
   * What a symlink at `path` gets: `follow` writes the file it points at, as a document saved
   * in place should; `replace` puts the new file where the link was, so a private file such as
   * a token is never written somewhere a planted link points.
   */
  symlink?: 'follow' | 'replace'
}

async function resolveTarget(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return path
    throw error
  }
}

async function existingMode(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mode & 0o7777
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}

/**
 * Writes `data` to `path` all at once: into a new file beside it, which then replaces it, so a
 * reader never sees half a file and a failed write leaves the old one. A symlink is written
 * through to the file it points at.
 */
export async function writeFileAtomic(
  path: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {}
): Promise<void> {
  const target = options.symlink === 'replace' ? path : await resolveTarget(path)
  const mode =
    options.mode ?? (options.symlink === 'replace' ? undefined : await existingMode(target))
  const temporary = join(dirname(target), `.${basename(target)}.${randomHex(8)}.tmp`)
  const handle = await open(temporary, 'wx', mode ?? 0o666)
  try {
    try {
      await handle.writeFile(data)
      // The mode `open` takes is masked by the umask; the file keeps the one it had.
      if (mode !== undefined) await chmod(temporary, mode)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}
