import { fileURLToPath } from 'node:url'

import { build, type Plugin } from 'vite'

import { viteBuildTarget } from '../src/app/shell/support/baseline'
import { createOpenPencilAliases } from './aliases.ts'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT_QUERY = '?script'

/**
 * `import source from './entry.ts?script'`: the module and everything it imports bundled into
 * one classic script, as a string. It is for code that can run only inline, such as the code
 * panel's sandbox, whose opaque-origin frame can start a worker only from a `blob:` URL. The
 * script is built the same way in dev and in a build, minified in a build.
 */
export function inlineScriptPlugin(): Plugin {
  let minify = false
  return {
    name: 'open-pencil-inline-script',
    configResolved(config) {
      minify = config.command === 'build'
    },
    load: {
      filter: { id: /\?script$/ },
      async handler(id) {
        const entry = id.slice(0, -SCRIPT_QUERY.length)
        const output = await build({
          configFile: false,
          root: REPO_ROOT,
          publicDir: false,
          logLevel: 'warn',
          resolve: { alias: createOpenPencilAliases(REPO_ROOT) },
          // An entry may itself inline another, as the sandbox frame inlines its worker.
          plugins: [inlineScriptPlugin()],
          build: {
            write: false,
            minify,
            target: viteBuildTarget(),
            emptyOutDir: false,
            copyPublicDir: false,
            lib: { entry, formats: ['iife'], name: 'openPencilInlineScript' }
          }
        })
        const chunks = (Array.isArray(output) ? output : [output]).flatMap((result) =>
          'output' in result ? result.output : []
        )
        const chunk = chunks.find((item) => item.type === 'chunk' && item.isEntry)
        if (chunk?.type !== 'chunk') throw new Error(`Could not bundle ${entry} as a script`)
        for (const moduleId of chunk.moduleIds) {
          if (!moduleId.startsWith('\0')) this.addWatchFile(moduleId.split('?')[0])
        }
        return { code: `export default ${JSON.stringify(chunk.code)}`, map: null }
      }
    }
  }
}
