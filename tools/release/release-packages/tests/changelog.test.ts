import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { validateChangelog } from '#release/changelog'
import { assembleUnreleased, parseFragmentBullets, readFragments } from '#release/fragments'

const validChangelog = `# Changelog

## Unreleased

### Breaking changes

- Replace the old API.

### Added

- Add **rich** release notes.

### Fixed

- Preserve user data.

## 1.2.0 — 2026-08-16

### Added

- Ship the previous feature.

## 0.1.0-alpha — 2026-03-01

### Added

- Publish the alpha.
`

function errors(source: string): string[] {
  return validateChangelog(source).errors
}

describe('validateChangelog', () => {
  test('accepts canonical Unreleased and release sections', () => {
    expect(errors(validChangelog)).toEqual([])
  })

  test('requires exactly one Unreleased section', () => {
    expect(errors(validChangelog.replace('## Unreleased', '## 1.3.0 — 2026-09-01'))).toContain(
      'Expected exactly one "## Unreleased" section; found 0.'
    )
    expect(errors(`${validChangelog}\n## Unreleased\n`)).toContain(
      'Expected exactly one "## Unreleased" section; found 2.'
    )
  })

  test('rejects duplicate, unsupported, empty, and out-of-order categories', () => {
    const source = `# Changelog

## Unreleased

### Fixed

- Fix one issue.

### Added

- Add one feature.

### Added

### Internal

- Refactor internals.

## 1.0.0 — 2026-01-01

### Added

- Ship version one.
`
    const result = errors(source)
    expect(result.some((error) => error.includes('category "Added" is out of order'))).toBe(true)
    expect(result.some((error) => error.includes('duplicate Unreleased category "Added"'))).toBe(
      true
    )
    expect(result.some((error) => error.includes('category "Added" is empty'))).toBe(true)
    expect(
      result.some((error) => error.includes('unsupported Unreleased category "Internal"'))
    ).toBe(true)
  })

  test('rejects duplicate Unreleased bullets while preserving Markdown distinctions', () => {
    const source = `# Changelog

## Unreleased

### Added

- Add **one** feature.
- Add **one** feature.
- Add one feature.

## 1.0.0 — 2026-01-01

### Added

- Add **one** feature.
`
    const result = errors(source)
    expect(result.filter((error) => error.includes('duplicate Unreleased bullet'))).toHaveLength(1)
  })

  test('rejects malformed release headings and impossible dates', () => {
    const malformed = validChangelog.replace('## 1.2.0 — 2026-08-16', '## v1.2.0 - August 16, 2026')
    expect(errors(malformed).some((error) => error.includes('invalid release heading'))).toBe(true)

    const impossible = validChangelog.replace('2026-08-16', '2026-02-31')
    expect(errors(impossible).some((error) => error.includes('invalid release date'))).toBe(true)
  })

  test('rejects nested headings and uncategorized content inside Unreleased', () => {
    const nested = validChangelog.replace(
      '- Add **rich** release notes.',
      '#### Details\n\n- Add **rich** release notes.'
    )
    expect(
      errors(nested).some((error) =>
        error.includes('Unreleased content may only use level-three category headings')
      )
    ).toBe(true)

    const uncategorized = validChangelog.replace(
      '## Unreleased\n\n### Breaking changes',
      '## Unreleased\n\n- Uncategorized.\n\n### Breaking changes'
    )
    expect(
      errors(uncategorized).some((error) =>
        error.includes('Unreleased bullets must follow an allowed category heading')
      )
    ).toBe(true)

    const prose = validChangelog.replace(
      '## Unreleased\n\n### Breaking changes',
      '## Unreleased\n\nUnexpected prose.\n\n### Breaking changes'
    )
    expect(errors(prose).some((error) => error.includes('unexpected content in Unreleased'))).toBe(
      true
    )
  })
})

describe('changelog fragments', () => {
  test('read bullets as written, with continuation lines and formatting', () => {
    const { bullets, errors } = parseFragmentBullets(
      '- Add **rich** notes,\n  wrapped over two lines.\n- Keep links like [docs](https://openpencil.dev).\n',
      'changes/12/added.md'
    )

    expect(errors).toEqual([])
    expect(bullets).toEqual([
      '- Add **rich** notes,\n  wrapped over two lines.',
      '- Keep links like [docs](https://openpencil.dev).'
    ])
  })

  test('refuse headings, prose outside a list, and bullets without a closing period', () => {
    expect(
      parseFragmentBullets('### Added\n\n- Add it.\n', 'changes/1/added.md').errors
    ).toHaveLength(1)
    expect(parseFragmentBullets('Add it.\n', 'changes/1/added.md').errors).toHaveLength(1)
    expect(parseFragmentBullets('- Add it\n', 'changes/1/added.md').errors).toEqual([
      'changes/1/added.md: end every bullet with a period: - Add it'
    ])
  })

  test('assemble after existing bullets, in category order and by pull request', () => {
    const changelog =
      '# Changelog\n\n## Unreleased\n\n### Fixed\n\n- Keep user data.\n\n## 1.0.0 — 2026-01-01\n\n### Added\n\n- Ship it.\n'
    const assembled = assembleUnreleased(changelog, [
      { pullRequest: 7, category: 'fixed', bullets: ['- Stop the crash.'] },
      { pullRequest: 9, category: 'breaking', bullets: ['- Remove the old API.'] },
      { pullRequest: 8, category: 'added', bullets: ['- Add export.', '- Add import.'] }
    ])

    expect(assembled).toBe(
      '# Changelog\n\n## Unreleased\n\n### Breaking changes\n\n- Remove the old API.\n\n### Added\n\n- Add export.\n- Add import.\n\n### Fixed\n\n- Keep user data.\n- Stop the crash.\n\n## 1.0.0 — 2026-01-01\n\n### Added\n\n- Ship it.\n'
    )
    expect(validateChangelog(assembled).errors).toEqual([])
  })

  test('refuse to assemble over Unreleased content it would drop', () => {
    const prose =
      '# Changelog\n\n## Unreleased\n\nA note.\n\n### Fixed\n\n- Keep user data.\n\n## 1.0.0 — 2026-01-01\n\n### Added\n\n- Ship it.\n'
    const uncategorized =
      '# Changelog\n\n## Unreleased\n\n- Loose bullet.\n\n## 1.0.0 — 2026-01-01\n\n### Added\n\n- Ship it.\n'

    expect(() => assembleUnreleased(prose, [])).toThrow('line 5: Unreleased holds content outside')
    expect(() => assembleUnreleased(uncategorized, [])).toThrow('line 5')
  })

  test('leave an empty Unreleased section as it is when nothing is pending', () => {
    const changelog =
      '# Changelog\n\n## Unreleased\n\n## 1.0.0 — 2026-01-01\n\n### Added\n\n- Ship it.\n'

    expect(assembleUnreleased(changelog, [])).toBe(changelog)
  })

  test('flag the same bullet added by two pull requests once assembled', () => {
    const changelog =
      '# Changelog\n\n## Unreleased\n\n## 1.0.0 — 2026-01-01\n\n### Added\n\n- Ship it.\n'
    const assembled = assembleUnreleased(changelog, [
      { pullRequest: 3, category: 'fixed', bullets: ['- Stop the crash.'] },
      { pullRequest: 4, category: 'fixed', bullets: ['- Stop the crash.'] }
    ])

    expect(validateChangelog(assembled).errors).toEqual([
      expect.stringContaining('duplicate Unreleased bullet')
    ])
  })
})

describe('readFragments', () => {
  test('treat a missing changes folder as nothing pending', async () => {
    const directory = join(await mkdtemp(join(tmpdir(), 'changes-')), 'absent')

    expect(await readFragments(directory)).toEqual({ fragments: [], errors: [] })
  })

  test('fail when the changes folder cannot be read', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'changes-')), 'not-a-folder')
    await writeFile(file, '')

    await expect(readFragments(file)).rejects.toThrow()
  })

  test('read pull request folders and report anything that does not fit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'changes-'))
    await mkdir(join(directory, '42'))
    await writeFile(join(directory, '42', 'fixed.md'), '- Stop the crash.\n')
    await writeFile(join(directory, '42', 'notes.md'), '- Not a category.\n')
    await mkdir(join(directory, 'draft'))
    await writeFile(join(directory, 'README.md'), '# Unreleased changes\n')

    const { fragments, errors } = await readFragments(directory)

    expect(fragments).toEqual([
      { pullRequest: 42, category: 'fixed', bullets: ['- Stop the crash.'] }
    ])
    expect(errors).toEqual([
      expect.stringContaining('changes/42/notes.md: expected one of breaking.md'),
      'changes/draft: expected a folder named after its pull request number.'
    ])
  })
})
