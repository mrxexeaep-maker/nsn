import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

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

/** Utilities that take a color, longest first so `ring-offset-` wins over `ring-`. */
const COLOR_PREFIXES = [
  'ring-offset',
  'border-x',
  'border-y',
  'border-t',
  'border-r',
  'border-b',
  'border-l',
  'border-s',
  'border-e',
  'placeholder',
  'decoration',
  'outline',
  'border',
  'divide',
  'accent',
  'stroke',
  'caret',
  'ring',
  'text',
  'fill',
  'from',
  'via',
  'bg',
  'to'
]

/** Colors every theme has without a token. */
const BUILT_IN_COLORS = new Set(['inherit', 'current', 'transparent', 'white', 'black'])

/** Values of the same utilities that are not colors, by prefix; `*` matches any prefix. */
const NON_COLOR_VALUES: Record<string, RegExp> = {
  '*': /^(?:\d|px$|auto$|none$|\()/,
  text: /^(?:xs|sm|base|lg|[2-9]?xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|clip|ellipsis|shadow)/,
  bg: /^(?:fixed|local|scroll|clip-|origin-|repeat|no-repeat|auto|cover|contain|top|bottom|left|right|center|linear|radial|conic|gradient-|blend-|position-|size-)/,
  border: /^(?:[xytrblse]$|solid|dashed|dotted|double|hidden|collapse|separate|spacing)/,
  ring: /^(?:inset)$/,
  outline: /^(?:solid|dashed|dotted|double|hidden|offset-)/,
  divide: /^(?:x|y|x-reverse|y-reverse|solid|dashed|dotted|double)(?:$|-)/,
  decoration: /^(?:solid|double|dotted|dashed|wavy|from-font|clone|slice)$/,
  from: /^\d/,
  via: /^\d/,
  to: /^\d/
}

const tokenCache = new Map<string, Set<string>>()

/** The stylesheet at `path` from the working directory or the nearest directory above it. */
function findStylesheet(path: string): string {
  if (isAbsolute(path)) return path
  for (let directory = process.cwd(); ; directory = dirname(directory)) {
    const candidate = join(directory, path)
    if (existsSync(candidate) || dirname(directory) === directory) return candidate
  }
}

/** The `--color-*` names a stylesheet defines, in any theme block. */
function colorTokens(stylesheet: string): Set<string> {
  let tokens = tokenCache.get(stylesheet)
  if (!tokens) {
    tokens = new Set(
      [...readFileSync(stylesheet, 'utf8').matchAll(/--color-([\w-]+)\s*:/g)].map((m) => m[1])
    )
    tokenCache.set(stylesheet, tokens)
  }
  return tokens
}

/** The utility a class names, without its variants, `!` and opacity. */
function utilityOf(className: string): string {
  let depth = 0
  let start = 0
  for (let index = 0; index < className.length; index++) {
    const char = className[index]
    if (char === '[') depth++
    else if (char === ']') depth--
    else if (char === ':' && depth === 0) start = index + 1
  }
  return className
    .slice(start)
    .replace(/^!|!$/g, '')
    .replace(/\/(?:\d+|\[[^\]]*\])$/, '')
}

/** Why a class names no theme color, or null when it is fine or not a color class. */
function colorClassProblem(className: string, tokens: ReadonlySet<string>): string | null {
  const utility = utilityOf(className)
  const prefix = COLOR_PREFIXES.find((candidate) => utility.startsWith(`${candidate}-`))
  if (!prefix) return null
  const value = utility.slice(prefix.length + 1)
  const property = prefix.startsWith('border-') ? 'border' : prefix
  if (value.startsWith('[')) {
    const variable = /^\[var\(--color-([\w-]+)\)\]$/.exec(value)
    return variable ? `use \`${prefix}-${variable[1]}\` instead of \`${utility}\`` : null
  }
  if (BUILT_IN_COLORS.has(value) || tokens.has(value)) return null
  if (NON_COLOR_VALUES['*'].test(value) || NON_COLOR_VALUES[property]?.test(value)) return null
  return `\`${className}\` names no color token in src/app.css`
}

function classNames(text: string): string[] {
  return text.split(/\s+/).filter((part) => /^[!\w[@-]/.test(part))
}

/** String literals in an expression's source, for `:class` bindings. */
function quotedStrings(expression: string): string[] {
  return [...expression.matchAll(/'([^']*)'|"([^"]*)"|`([^`$]*)`/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? ''
  )
}

const CLASS_HELPERS = new Set(['tv', 'twMerge', 'twJoin'])

function isClassHelperCall(node: ESTree.CallExpression): boolean {
  return node.callee.type === 'Identifier' && CLASS_HELPERS.has(node.callee.name)
}

/**
 * Require color utilities to name a theme token. Tailwind drops a class whose color it does not
 * know without a warning, so a typo or a removed token leaves the text or border uncolored, and
 * the default palette does not follow the light theme.
 */
export const noUndefinedColorClassesRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Require Tailwind color utilities to name a --color-* token from the theme.'
    },
    schema: [
      {
        type: 'object',
        properties: { stylesheet: { type: 'string' } },
        additionalProperties: false
      }
    ]
  },
  create(context) {
    const file = normalizedFilename(context)
    const options = context.options[0]
    const stylesheet =
      options &&
      typeof options === 'object' &&
      'stylesheet' in options &&
      typeof options.stylesheet === 'string'
        ? options.stylesheet
        : 'src/app.css'
    const tokens = colorTokens(findStylesheet(stylesheet))
    const themeModule = file.startsWith('src/theme/') || file.includes('/src/theme/')

    function check(node: ESTree.Node, text: string) {
      for (const className of classNames(text)) {
        const problem = colorClassProblem(className, tokens)
        if (problem) context.report({ node, message: `Color class: ${problem}.` })
      }
    }

    function checkStrings(node: ESTree.Node) {
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
              for (const text of quotedStrings(expression)) check(node, text)
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
