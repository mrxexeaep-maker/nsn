import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { normalizedFilename } from '#lint/support/context.ts'
import {
  VUE_DIRECTIVE_NODE,
  VUE_ELEMENT_NODE,
  isVueSourceFile,
  vueComponentSource,
  vueTemplateAst,
  walkVueTemplateAst
} from '#lint/support/vue.ts'
import { defineRule } from '@oxlint/plugins'
import type { ESTree } from '@oxlint/plugins'
import { __unstable__loadDesignSystem } from '@tailwindcss/node'
import { compact } from 'es-toolkit/array'

/**
 * Tailwind's own model of the app's theme, utilities, and variants. `bun run lint` and the rule's
 * tests run Oxlint from the repository root; a run elsewhere has no app theme to check against,
 * and the rule stays quiet rather than keep the plugin's other rules from loading.
 */
type DesignSystem = Awaited<ReturnType<typeof __unstable__loadDesignSystem>>

const stylesheet = resolve('src/app.css')
const designSystem = existsSync(stylesheet)
  ? await __unstable__loadDesignSystem(readFileSync(stylesheet, 'utf8'), {
      base: dirname(stylesheet)
    })
  : null

const verdicts = new Map<string, string | null>()

/**
 * Why Tailwind cannot use a class, or null when it can or the class is not Tailwind's. A class
 * Tailwind parses as a utility but compiles to nothing names a value the theme lacks, such as a
 * color with no token. A color written as `[var(--color-*)]` has a utility of its own.
 */
function classProblem(system: DesignSystem, className: string): string | null {
  const cached = verdicts.get(className)
  if (cached !== undefined) return cached
  const candidates = system.parseCandidate(className)
  const [css] = system.candidatesToCss([className])
  let problem: string | null = null
  if (!css) {
    if (candidates.length > 0)
      problem = `Tailwind has no \`${className}\`; src/app.css defines no such value`
  } else {
    for (const candidate of candidates) {
      if (candidate.kind !== 'functional' || candidate.value?.kind !== 'arbitrary') continue
      const color = /^var\(--color-([\w-]+)\)$/.exec(candidate.value.value)
      if (!color) continue
      problem =
        system.resolveThemeValue(`--color-${color[1]}`) === undefined
          ? `\`${className}\` names \`--color-${color[1]}\`, which src/app.css does not define`
          : `use \`${candidate.root}-${color[1]}\` instead of \`${className}\``
    }
  }
  verdicts.set(className, problem)
  return problem
}

function classNames(text: string): string[] {
  return compact(text.split(/\s+/))
}

const CLASS_KEYS = new Set(['class', 'className'])

/**
 * The class strings in a `:class` binding's source: array items and object keys, and values only
 * under `class`, since other keys pass arguments such as a variant (`menu({ justify: 'start' })`).
 */
function boundClassStrings(expression: string): string[] {
  const strings = /(?:([\w$]+)\s*:\s*)?(?:'([^']*)'|"([^"]*)"|`([^`$]*)`)/g
  return [...expression.matchAll(strings)].flatMap(([, key, ...quoted]) =>
    key && !CLASS_KEYS.has(key) ? [] : [quoted.find((text) => text !== undefined) ?? '']
  )
}

function propertyKey(node: ESTree.Node): string | null {
  if (node.type !== 'Property') return null
  if (node.key.type === 'Identifier') return node.key.name
  return node.key.type === 'Literal' && typeof node.key.value === 'string' ? node.key.value : null
}

/**
 * Whether a string is a class list, following tailwind-variants: `defaultVariants` and the
 * conditions of `compoundVariants` entries select variants, and their `class` holds classes.
 * Type literals and module paths are not classes either.
 */
function isClassString(node: ESTree.Node): boolean {
  let child: ESTree.Node = node
  for (let parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (parent.type === 'TSLiteralType') return false
    if (
      (parent.type === 'ImportDeclaration' ||
        parent.type === 'ExportNamedDeclaration' ||
        parent.type === 'ExportAllDeclaration') &&
      parent.source === child
    )
      return false
    const key = propertyKey(parent)
    if (key === 'defaultVariants') return false
    const entry = parent.parent
    if (
      key !== null &&
      child === (parent.type === 'Property' ? parent.value : null) &&
      entry?.type === 'ObjectExpression' &&
      entry.parent?.type === 'ArrayExpression' &&
      propertyKey(entry.parent.parent ?? entry) === 'compoundVariants'
    )
      return CLASS_KEYS.has(key)
  }
  return true
}

const CLASS_HELPERS = new Set(['tv', 'twMerge', 'twJoin'])

function isClassHelperCall(node: ESTree.CallExpression): boolean {
  return node.callee.type === 'Identifier' && CLASS_HELPERS.has(node.callee.name)
}

/**
 * Require every class Tailwind reads to be one it can build. It drops a class it does not know
 * without a warning, so a typo or a color with no token leaves the element unstyled. Classes are
 * read from Vue class attributes and bindings, `tv`, `twMerge` and `twJoin` calls, and theme
 * modules under `src/theme/`.
 */
export const noUnknownTailwindClassesRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Require Tailwind classes to be ones the app theme can build.'
    }
  },
  create(context) {
    const system = designSystem
    if (!system) return {}
    const file = normalizedFilename(context)
    const themeModule = file.startsWith('src/theme/') || file.includes('/src/theme/')

    const check = (node: ESTree.Node, text: string) => {
      for (const className of classNames(text)) {
        const problem = classProblem(system, className)
        if (problem) context.report({ node, message: `Tailwind class: ${problem}.` })
      }
    }

    function checkStrings(node: ESTree.Node) {
      if (!isClassString(node)) return
      if (node.type === 'Literal' && typeof node.value === 'string') check(node, node.value)
      else if (node.type === 'TemplateLiteral')
        for (const quasi of node.quasis) check(node, quasi.value.cooked ?? quasi.value.raw)
    }

    let helperDepth = 0
    return {
      Program(node) {
        if (!isVueSourceFile(file)) return
        const source = vueComponentSource(context.sourceCode.getText(), file)
        const template = vueTemplateAst(source, file)
        if (!template) return
        walkVueTemplateAst(template, (templateNode) => {
          if (templateNode.type !== VUE_ELEMENT_NODE) return
          for (const prop of templateNode.props) {
            if (prop.type !== VUE_DIRECTIVE_NODE) {
              if (prop.name === 'class' && prop.value) check(node, prop.value.content)
              continue
            }
            const arg = prop.arg?.type === 4 ? prop.arg.content : null
            const expression = prop.exp?.type === 4 ? prop.exp.content : null
            if (prop.name === 'bind' && arg === 'class' && expression)
              for (const text of boundClassStrings(expression)) check(node, text)
          }
        })
      },
      CallExpression(node) {
        if (isClassHelperCall(node)) helperDepth++
      },
      'CallExpression:exit'(node: ESTree.CallExpression) {
        if (isClassHelperCall(node)) helperDepth--
      },
      Literal(node) {
        if (themeModule || helperDepth > 0) checkStrings(node)
      },
      TemplateLiteral(node) {
        if (themeModule || helperDepth > 0) checkStrings(node)
      }
    }
  }
})
