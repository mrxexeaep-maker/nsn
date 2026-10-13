import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { assembleUnreleased, readFragments } from './fragments'
import { validateChangelog } from './validate'

const root = resolve(process.argv[2] ?? '.')
const changelogPath = resolve(root, 'CHANGELOG.md')

const { fragments, errors: fragmentErrors } = await readFragments(resolve(root, 'changes'))
// Validated as it will read once the fragments are assembled, so duplicates across pull
// requests and fragments in an empty category are caught now rather than at release.
const changelog = await readFile(changelogPath, 'utf8')
const { errors: changelogErrors } = validateChangelog(assembleUnreleased(changelog, fragments))
const errors = [...fragmentErrors, ...changelogErrors]

if (errors.length > 0) {
  process.stderr.write(
    `Changelog validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`
  )
  process.exit(1)
}

process.stdout.write(
  `Changelog validation passed: ${changelogPath} and ${fragments.length} fragments in changes/\n`
)
