/**
 * The Mermaid grammars `@open-pencil/mermaid` parses with, taken from one pinned Mermaid release.
 *
 * Mermaid parses flowcharts with a JISON grammar whose parser calls methods on a `yy` object;
 * Mermaid's `FlowDB` fills its renderer's state there, and `@open-pencil/mermaid` supplies its
 * own object that builds a typed model instead. The grammar is not in Mermaid's npm package, so
 * the generator downloads it from the release's commit, builds the parser as Mermaid's build
 * does, and commits both, so building and testing never need the network or JISON.
 *
 * When Mermaid switches flowcharts to its new parser: Mermaid is moving each diagram from JISON
 * and Langium to a Chevrotain lexer, parser, and visitor kept beside the diagram
 * (mermaid-js/mermaid#7855, pie charts first). Once flowcharts have one, copy those TypeScript
 * files here instead of `flow.jison`, add the `chevrotain` runtime to `@open-pencil/mermaid`,
 * and adapt `packages/mermaid/src/flowchart/builder.ts` to what the visitor produces; the model
 * and everything that reads it stay as they are.
 */
export const MERMAID_RELEASE = {
  tag: 'mermaid@12.2.0',
  commit: '1fb7869866dd619168d840291c9c54b4f129758b'
}

export interface Grammar {
  /** The parser's file name under `packages/mermaid/src/grammar/`. */
  name: string
  /** The grammar's path in Mermaid's repository. */
  source: string
}

export const GRAMMARS: Grammar[] = [
  { name: 'flow', source: 'packages/mermaid/src/diagrams/flowchart/parser/flow.jison' }
]

/**
 * Mermaid sources `@open-pencil/mermaid` follows by hand rather than copies: what the grammar's
 * calls mean (`FlowDB`), the shape names, and how text is prepared for the grammar. `--check`
 * shows how a newer release changes them.
 */
export const FOLLOWED_SOURCES = [
  'packages/mermaid/src/diagrams/flowchart/flowDb.ts',
  'packages/mermaid/src/rendering-util/rendering-elements/shapes.ts',
  'packages/mermaid/src/preprocess.ts'
]

/** Where the grammars and the licence they come under are written. */
export const GRAMMAR_DIR = 'packages/mermaid/src/grammar'

export function sourceURL(path: string, commit = MERMAID_RELEASE.commit): string {
  return `https://raw.githubusercontent.com/mermaid-js/mermaid/${commit}/${path}`
}
