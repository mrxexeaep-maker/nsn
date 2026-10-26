import * as v from 'valibot'
import { parse as parseYAML } from 'yaml'

/**
 * Mermaid source prepared for a diagram's grammar, as Mermaid's `preprocessDiagram` and
 * `encodeEntities` prepare it in the pinned release (MIT, Copyright (c) 2014 - 2022 Knut
 * Sveidqvist): line endings made `\n`, front matter and `%%{ … }%%` directives taken out, `%%`
 * comments dropped, and `#name;` entities hidden from the grammar, which reads `;` as a statement
 * break.
 */
export interface PreparedSource {
  code: string
  title?: string
}

/** Front matter fenced by `---` lines at the very start, with the indent its fences share. */
const FRONT_MATTER = /^([^\S\n]*)---[^\S\n]*\n([\s\S]*?)\n\1---[^\S\n]*(?:\n+|$)/

const DIRECTIVE = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi

const COMMENT_LINE = /^\s*%%(?!{)[^\n]+\n?/gm

/** Marks Mermaid puts around an entity's name or number while the grammar reads the text. */
const ENTITY_OPEN = 'ﬂ°'
const NUMERIC_ENTITY_OPEN = 'ﬂ°°'
const ENTITY_CLOSE = '¶ß'

/** The front matter OpenPencil reads: the title, which YAML may give as a number or a flag. */
const frontMatterSchema = v.looseObject({
  title: v.optional(v.pipe(v.union([v.string(), v.number(), v.boolean()]), v.toString()))
})

function frontMatterTitle(body: string): string | undefined {
  try {
    const parsed = v.safeParse(frontMatterSchema, parseYAML(body))
    return parsed.success ? parsed.output.title : undefined
  } catch {
    return undefined
  }
}

function hideEntities(text: string): string {
  return text
    .replace(/(?:style|classDef).*:\S*#.*;/g, (statement) => statement.slice(0, -1))
    .replace(/#\w+;/g, (entity) => {
      const name = entity.slice(1, -1)
      const open = /^\+?\d+$/.test(name) ? NUMERIC_ENTITY_OPEN : ENTITY_OPEN
      return `${open}${name}${ENTITY_CLOSE}`
    })
}

export function prepareSource(text: string): PreparedSource {
  let code = text
    .replace(/\r\n?/g, '\n')
    // Mermaid's grammars expect HTML attributes in single quotes.
    .replace(
      /<(\w+)([^>]*)>/g,
      (_tag, name: string, attributes: string) =>
        `<${name}${attributes.replace(/="([^"]*)"/g, "='$1'")}>`
    )
  let title: string | undefined
  const frontMatter = FRONT_MATTER.exec(code)
  if (frontMatter) {
    const indent = frontMatter[1] ?? ''
    const body = (frontMatter[2] ?? '')
      .split('\n')
      .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
      .join('\n')
    title = frontMatterTitle(body)
    code = code.slice(frontMatter[0].length)
  }
  code = code.replace(DIRECTIVE, '').replace(COMMENT_LINE, '').trimStart()
  return { code: hideEntities(code), title }
}

/** The entities `prepareSource` hid, written as HTML entities again (`&quot;`, `&#9829;`). */
export function revealEntities(text: string): string {
  return text
    .replaceAll(NUMERIC_ENTITY_OPEN, '&#')
    .replaceAll(ENTITY_OPEN, '&')
    .replaceAll(ENTITY_CLOSE, ';')
}
