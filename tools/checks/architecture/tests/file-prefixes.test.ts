import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openPencilArchitecturePlugin } from '../src/steiger-rules/index'
import { FILE_PREFIX_BASELINE_PATH } from '../src/steiger-rules/support'

const rule = openPencilArchitecturePlugin.ruleDefinitions.find(
  (candidate) => candidate.name === 'open-pencil/prefer-domain-folders-over-filename-prefixes'
)

async function check(files: string[], baseline: string[] = []) {
  if (!rule) throw new Error('Missing file prefix rule')
  const root = await mkdtemp(join(tmpdir(), 'open-pencil-file-prefixes-'))
  await mkdir(join(root, 'tools/checks/architecture'), { recursive: true })
  await writeFile(join(root, FILE_PREFIX_BASELINE_PATH), baseline.join('\n'))
  const folder = join(root, 'src/runtime')
  return rule.check({
    type: 'folder',
    path: root,
    children: [
      {
        type: 'folder',
        path: folder,
        children: files.map((file) => ({ type: 'file' as const, path: join(folder, file) }))
      }
    ]
  }).diagnostics.length
}

test('asks for a folder when a file sits beside files named after it', async () => {
  expect(await check(['email.ts', 'email-runtime.ts'])).toBe(1)
  expect(await check(['auth-failure.ts', 'auth-navigation.ts', 'auth-session.ts'])).toBe(1)
})

test('accepts names that only share a word', async () => {
  expect(await check(['sign-in.ts', 'sign-out.ts'])).toBe(0)
  expect(await check(['email.ts', 'server.ts'])).toBe(0)
})

test('keeps grandfathered groups until they move, then asks to drop their line', async () => {
  expect(await check(['email.ts', 'email-runtime.ts'], ['src/runtime::email'])).toBe(0)
  expect(await check(['server.ts'], ['src/runtime::email'])).toBe(1)
})
