import type * as HappyDOM from 'happy-dom'

import { IS_BROWSER } from '#core/constants'

/** A page's SVG markup as the element svg2pdf draws, or null when it does not parse. */
export type SVGPageParser = (svg: string) => Element | null

interface SVGParser {
  parseFromString(
    svg: string,
    type: 'image/svg+xml'
  ): {
    querySelector(selectors: string): unknown
    documentElement: unknown
  }
}

/**
 * The globals svg2pdf reads: it parses a page's stylesheets in a document it makes, and keeps the
 * rules that are instances of the CSSOM classes.
 */
interface SVG2PDFGlobals {
  document?: unknown
  CSSStyleSheet?: unknown
  CSSStyleRule?: unknown
}

const SVG2PDF_GLOBALS = ['document', 'CSSStyleSheet', 'CSSStyleRule'] as const

/**
 * Kept out of the browser bundle: a browser has a DOM of its own, and happy-dom is only loaded
 * where there is none.
 */
const HAPPY_DOM = 'happy-dom'

let exporting: Promise<unknown> = Promise.resolve()

function isElement(value: unknown): value is Element {
  return typeof value === 'object' && value !== null && 'tagName' in value
}

function parseSVGPage(parser: SVGParser): SVGPageParser {
  return (svg) => {
    const parsed = parser.parseFromString(svg, 'image/svg+xml')
    if (parsed.querySelector('parsererror')) return null
    return isElement(parsed.documentElement) ? parsed.documentElement : null
  }
}

/**
 * Runs `draw` with a parser for page SVG and the DOM svg2pdf draws it through. A browser has both.
 * Elsewhere, as in the CLI, happy-dom stands in: svg2pdf reads its DOM as globals, so they are set
 * only while `draw` runs, one export at a time, and restored after.
 */
export function withPDFDOM<T>(draw: (parse: SVGPageParser) => Promise<T>): Promise<T> {
  if (IS_BROWSER) return draw(parseSVGPage(new DOMParser()))
  const run = exporting.then(() => withHappyDOM(draw))
  exporting = run.catch(() => undefined)
  return run
}

async function withHappyDOM<T>(draw: (parse: SVGPageParser) => Promise<T>): Promise<T> {
  const { Window } = (await import(/* @vite-ignore */ HAPPY_DOM)) as typeof HappyDOM
  const dom = new Window()
  const scope: SVG2PDFGlobals = globalThis
  // Descriptors, so a global a host defines as an accessor comes back as one.
  const previous = SVG2PDF_GLOBALS.map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const
  )
  const installed: Required<SVG2PDFGlobals> = {
    document: dom.document,
    CSSStyleSheet: dom.CSSStyleSheet,
    CSSStyleRule: dom.CSSStyleRule
  }
  try {
    for (const name of SVG2PDF_GLOBALS) {
      Object.defineProperty(globalThis, name, {
        value: installed[name],
        configurable: true,
        writable: true
      })
    }
    return await draw(parseSVGPage(new dom.DOMParser()))
  } finally {
    try {
      delete scope.document
      delete scope.CSSStyleSheet
      delete scope.CSSStyleRule
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      }
    } finally {
      await dom.happyDOM.close()
    }
  }
}
