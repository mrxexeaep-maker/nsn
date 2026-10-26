import { decodeHTML } from 'entities'

import type { FlowLabel } from './flowchart/model'
import { revealEntities } from './source'

/** A label as Mermaid's grammar hands it over: its text, and how that text is to be read. */
export interface GrammarText {
  text: string
  type: string
}

/**
 * A label's text as plain text and its format. Mermaid draws labels as HTML, so a `<br>` breaks
 * the line, other tags only style the text, which is kept, and entities stand for characters.
 * Markdown, written in backticks, keeps its marks for whoever draws it.
 */
export function readLabel(label: GrammarText): FlowLabel {
  let text = revealEntities(label.text.trim())
  // Mermaid drops the quotes around a label written in them.
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1)
  if (label.type === 'markdown') return { text: decodeHTML(text), format: 'markdown' }
  return {
    text: decodeHTML(text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[a-z][^>]*>/gi, '')),
    format: 'text'
  }
}
