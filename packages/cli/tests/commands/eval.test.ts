import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CLI_ENTRY, FIXTURES } from '#cli-tests/helpers/paths'
import * as v from 'valibot'

setDefaultTimeout(60_000)

async function cli(args: string[], stdin?: string) {
  const proc = Bun.spawn([process.execPath, CLI_ENTRY, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: stdin ? Buffer.from(stdin) : undefined
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ])
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: await proc.exited }
}

describe('eval CLI', () => {
  test('saves a script’s edits laid out, though the script never read them back', async () => {
    const out = join(await mkdtemp(join(tmpdir(), 'open-pencil-eval-')), 'badge.fig')
    // A hugging badge whose label a property shortens: its saved width fits the new label.
    const script = `
      const badge = figma.createComponent()
      badge.name = 'Badge'
      badge.layoutMode = 'HORIZONTAL'
      badge.paddingLeft = badge.paddingRight = 10
      badge.primaryAxisSizingMode = 'AUTO'
      badge.counterAxisSizingMode = 'AUTO'
      const label = figma.createText()
      label.characters = 'Placeholder'
      badge.appendChild(label)
      const prop = badge.addComponentProperty('Label', 'TEXT', 'Placeholder')
      label.componentPropertyReferences = { characters: prop }
      const instance = badge.createInstance()
      instance.name = 'Short'
      instance.setProperties({ [prop]: '2' })
    `
    const written = await cli(
      ['eval', join(FIXTURES, 'gold-preview.fig'), '--stdin', '-o', out, '-q'],
      script
    )
    expect(written.exitCode).toBe(0)
    const read = await cli([
      'eval',
      out,
      '--json',
      '--code',
      `
        const short = figma.currentPage.findOne((n) => n.name === 'Short')
        const badge = figma.currentPage.findOne((n) => n.type === 'COMPONENT' && n.name === 'Badge')
        return [short.width < badge.width, short.children[0].width < badge.children[0].width]
      `
    ])
    const parsed = v.safeParse(v.pipe(v.string(), v.parseJson(), v.array(v.boolean())), read.stdout)
    expect(parsed.success && parsed.output).toEqual([true, true])
  })
})
