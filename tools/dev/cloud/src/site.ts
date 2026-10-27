import { existsSync, watch, type FSWatcher } from 'node:fs'
import { lstat, mkdir, readdir, realpath, rename, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'

/** What the Cloud site is built from, relative to the workspace; a change in any of them rebuilds. */
const SITE_INPUTS = [
  'src',
  'packages',
  'public',
  'vite',
  'index.html',
  'cloud.html',
  'vite.config.ts'
]
/** How long changes settle before a build starts, so saving several files builds once. */
const SETTLE_MS = 300

/**
 * Runs `build` one at a time: asking while one runs starts a single build after it, so the last
 * build always includes every change.
 */
export function createRebuildQueue(build: () => Promise<void>) {
  let last: Promise<void> = Promise.resolve()
  let waiting: Promise<void> | null = null

  return function run(): Promise<void> {
    if (!waiting) {
      waiting = last.then(() => {
        waiting = null
        return build()
      })
      last = waiting.catch(() => undefined)
    }
    return waiting
  }
}

/** Collects changed paths and hands them over together once no change has come for `settleMs`. */
export function settleChanges(onSettled: (paths: string[]) => void, settleMs = SETTLE_MS) {
  const paths = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    changed(path: string) {
      paths.add(path)
      clearTimeout(timer)
      timer = setTimeout(() => {
        const settled = [...paths]
        paths.clear()
        onSettled(settled)
      }, settleMs)
    },
    cancel() {
      clearTimeout(timer)
    }
  }
}

/** The paths git does not ignore, so builds and generated files never start another build. */
async function sourcePaths(root: string, paths: string[]): Promise<string[]> {
  const check = Bun.spawn(['git', 'check-ignore', '--stdin'], {
    cwd: root,
    stdin: new TextEncoder().encode(paths.join('\n')),
    stdout: 'pipe'
  })
  const ignored = new Set((await new Response(check.stdout).text()).split('\n'))
  await check.exited
  return paths.filter((path) => !ignored.has(path))
}

/**
 * Keeps the Cloud site in `dist-cloud` built from the workspace while the dev server runs. Each
 * build is a complete one in its own directory under `dist-cloud.builds`, and `dist-cloud` is a
 * link that moves to a build only once it succeeds: renaming a new link over it is atomic, so the
 * server never finds the site missing, half-written, or broken, and a failed build keeps the last
 * one. Vite's own watch mode rebuilt in place and sometimes left the stylesheet out.
 */
export async function serveSiteBuilds(root: string): Promise<{ stop(): void }> {
  const served = join(root, 'dist-cloud')
  const builds = join(root, 'dist-cloud.builds')
  const stopping = new AbortController()
  const stopped = () => stopping.signal.aborted

  async function serve(build: string): Promise<void> {
    const link = join(builds, 'serving')
    await rm(link, { force: true })
    // A junction on Windows, which needs no privilege; other systems ignore the type.
    await symlink(build, link, 'junction')
    // A plain `build:cloud` leaves a directory, which a link cannot replace in one rename.
    const current = await lstat(served).catch(() => null)
    if (current && !current.isSymbolicLink()) await rm(served, { recursive: true, force: true })
    const replaced = current?.isSymbolicLink() ? await realpath(served).catch(() => null) : null
    await rename(link, served)
    // The build just replaced stays for requests still reading it; older ones go.
    for (const entry of await readdir(builds)) {
      const path = join(builds, entry)
      if (path !== build && path !== replaced) await rm(path, { recursive: true, force: true })
    }
  }

  const rebuild = createRebuildQueue(async () => {
    if (stopped()) return
    const build = join(builds, String(Date.now()))
    const child = Bun.spawn(['bun', 'run', 'build:cloud', '--outDir', build], {
      cwd: root,
      stdout: 'inherit',
      stderr: 'inherit',
      signal: stopping.signal
    })
    const exitCode = await child.exited
    if (stopped()) return
    if (exitCode === 0) return serve(await realpath(build))
    console.warn('[cloud:dev] The site build failed; the last good build stays served.')
    await rm(build, { recursive: true, force: true })
  })

  const changes = settleChanges((paths) => {
    sourcePaths(root, paths)
      .then((sources) => (sources.length > 0 ? rebuild() : undefined))
      .catch((error: unknown) => {
        console.warn(
          '[cloud:dev] Rebuilding the site failed; the last good build stays served.',
          error
        )
      })
  })
  const watchers: FSWatcher[] = SITE_INPUTS.filter((input) => existsSync(join(root, input))).map(
    (input) =>
      watch(join(root, input), { recursive: true }, (_event, file) => {
        changes.changed(file ? join(input, file) : input)
      })
  )
  await mkdir(builds, { recursive: true })
  await rebuild()

  return {
    stop() {
      stopping.abort()
      changes.cancel()
      for (const watcher of watchers) watcher.close()
    }
  }
}
