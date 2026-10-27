import { existsSync, watch, type FSWatcher } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
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
 * build is a complete one into a staging directory that replaces the served one only when it
 * succeeds, so the server never serves a half-written or broken site; a failed build keeps the
 * last one. Vite's own watch mode rebuilt in place and sometimes left the stylesheet out.
 */
export async function serveSiteBuilds(root: string): Promise<{ stop(): void }> {
  const served = join(root, 'dist-cloud')
  const next = join(root, 'dist-cloud.next')
  const previous = join(root, 'dist-cloud.previous')
  let child: ReturnType<typeof Bun.spawn> | null = null

  const rebuild = createRebuildQueue(async () => {
    child = Bun.spawn(['bun', 'run', 'build:cloud', '--outDir', next, '--emptyOutDir'], {
      cwd: root,
      stdout: 'inherit',
      stderr: 'inherit'
    })
    const exitCode = await child.exited
    child = null
    if (exitCode !== 0) {
      console.warn('[cloud:dev] The site build failed; the last good build stays served.')
      return
    }
    await rm(previous, { recursive: true, force: true })
    if (existsSync(served)) await rename(served, previous)
    await rename(next, served)
    await rm(previous, { recursive: true, force: true })
  })

  const changes = settleChanges((paths) => {
    void sourcePaths(root, paths).then((sources) => (sources.length > 0 ? rebuild() : undefined))
  })
  const watchers: FSWatcher[] = SITE_INPUTS.filter((input) => existsSync(join(root, input))).map(
    (input) =>
      watch(join(root, input), { recursive: true }, (_event, file) => {
        changes.changed(file ? join(input, file) : input)
      })
  )
  await rebuild()

  return {
    stop() {
      changes.cancel()
      for (const watcher of watchers) watcher.close()
      child?.kill()
    }
  }
}
