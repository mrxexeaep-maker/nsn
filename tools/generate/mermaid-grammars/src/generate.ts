/**
 * Writes Mermaid's grammars and the parsers built from them into `packages/mermaid/src/grammar`,
 * from the release pinned in `grammars.ts`, with Mermaid's licence beside them.
 *
 * usage: bun generate.ts            write the pinned release's grammars and parsers
 *        bun generate.ts --check    compare the pinned grammars with Mermaid's latest release
 */
import { join } from 'node:path'

import { resolveWorkspaceRoot } from '@open-pencil/package-artifacts-tools'

import { FOLLOWED_SOURCES, GRAMMAR_DIR, GRAMMARS, MERMAID_RELEASE, sourceURL } from './grammars'
import { parserModule } from './jison'
import { latestRelease } from './releases'

async function download(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.text()
}

const root = await resolveWorkspaceRoot(import.meta.dir)

if (process.argv.includes('--check')) {
  const latest = latestRelease()
  if (latest.tag === MERMAID_RELEASE.tag) {
    console.log(`Pinned to ${MERMAID_RELEASE.tag}, Mermaid's latest release.`)
    process.exit(0)
  }
  let changed = false
  const scratch = join(root, 'node_modules/.cache/mermaid-grammars')
  const compare = async (name: string, pinned: string, current: string) => {
    if (pinned === current) return
    changed = true
    const pinnedPath = join(scratch, 'pinned', name)
    const latestPath = join(scratch, 'latest', name)
    await Bun.write(pinnedPath, pinned)
    await Bun.write(latestPath, current)
    Bun.spawnSync(['git', 'diff', '--no-index', pinnedPath, latestPath], {
      stdout: 'inherit',
      stderr: 'inherit'
    })
  }
  for (const grammar of GRAMMARS) {
    await compare(
      `${grammar.name}.jison`,
      await Bun.file(join(root, GRAMMAR_DIR, `${grammar.name}.jison`)).text(),
      await download(sourceURL(grammar.source, latest.commit))
    )
  }
  for (const path of FOLLOWED_SOURCES) {
    const [pinned, current] = await Promise.all([
      download(sourceURL(path)),
      download(sourceURL(path, latest.commit))
    ])
    await compare(path.split('/').at(-1) ?? path, pinned, current)
  }
  console.log(
    changed
      ? `${latest.tag} changes the sources above: pin it in grammars.ts, regenerate, and follow the changes to FlowDB, the shapes, and text preparation in @open-pencil/mermaid.`
      : `${latest.tag} is out, with the same grammars and followed sources as ${MERMAID_RELEASE.tag}.`
  )
  process.exit(changed ? 1 : 0)
}

const [licence, ...sources] = await Promise.all([
  download(sourceURL('LICENSE')),
  ...GRAMMARS.map((grammar) => download(sourceURL(grammar.source)))
])
const dir = join(root, GRAMMAR_DIR)
await Bun.write(join(dir, 'MERMAID-LICENSE.txt'), licence)
for (const [index, grammar] of GRAMMARS.entries()) {
  const source = sources[index] ?? ''
  await Bun.write(join(dir, `${grammar.name}.jison`), source)
  await Bun.write(join(dir, `${grammar.name}.js`), parserModule(grammar, source))
}
console.log(
  `${GRAMMARS.map((grammar) => grammar.name).join(', ')} written from ${MERMAID_RELEASE.tag}`
)
