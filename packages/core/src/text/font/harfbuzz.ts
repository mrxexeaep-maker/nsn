import type * as HarfBuzzModule from 'harfbuzzjs'

import type { FontVariation } from '@open-pencil/scene-graph'

import { fontTableView } from './variation'

export interface OutlineCommand {
  type: string
  x?: number
  y?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
}

type HarfBuzz = typeof HarfBuzzModule

let harfBuzz: HarfBuzz | null = null
let harfBuzzLoading: Promise<HarfBuzz | null> | null = null

/** Whether HarfBuzz has loaded, so fonts can be read synchronously. */
export function isHarfBuzzLoaded(): boolean {
  return harfBuzz !== null
}

/**
 * Loads HarfBuzz, which reads glyph outlines, advances, and shaping for Core's synchronous font
 * readers. Fonts only arrive asynchronously, so the font manager waits for it as it loads one;
 * until then, or if it fails to load, the readers answer as for a font that is not loaded.
 */
export function loadHarfBuzz(): Promise<HarfBuzz | null> {
  harfBuzzLoading ??= import('harfbuzzjs').then(
    (module) => (harfBuzz = module),
    (error: unknown) => {
      console.warn('HarfBuzz failed to load; glyph outlines are unavailable:', error)
      return null
    }
  )
  return harfBuzzLoading
}

/** A font file as HarfBuzz reads it: its face, and the font drawing its default instance. */
export interface HarfBuzzFont {
  hb: HarfBuzz
  face: HarfBuzzModule.Face
  font: HarfBuzzModule.Font
  bytes: ArrayBuffer
  glyphCount: number
  /** Glyph IDs by code point and default advances by glyph ID, read once each. */
  glyphIds: Map<number, number>
  advances: Map<number, number>
}

/** A font file read by HarfBuzz, or `null` when HarfBuzz is not loaded or the file has no glyphs. */
export function harfBuzzFont(bytes: ArrayBuffer): HarfBuzzFont | null {
  const hb = harfBuzz
  const maxp = fontTableView(bytes, 'maxp')
  const glyphCount = maxp && maxp.byteLength >= 6 ? maxp.getUint16(4) : 0
  if (!hb || glyphCount === 0) return null
  const face = new hb.Face(new hb.Blob(bytes))
  return {
    hb,
    face,
    font: new hb.Font(face),
    bytes,
    glyphCount,
    glyphIds: new Map(),
    advances: new Map()
  }
}

/** HarfBuzz's font drawing the instance at `variations`. */
export function variedFont(
  parsed: HarfBuzzFont,
  variations: readonly FontVariation[]
): HarfBuzzModule.Font {
  if (variations.length === 0) return parsed.font
  const font = new parsed.hb.Font(parsed.face)
  font.setVariations(variations.map(({ axis, value }) => new parsed.hb.Variation(axis, value)))
  return font
}

/** Where an outline is collected, and how font units map to it. */
interface OutlineTarget {
  commands: OutlineCommand[]
  scale: number
  baseline: number
}

let outlineDrawing: HarfBuzzModule.DrawFuncs | null = null

/**
 * The draw callbacks that collect an outline into its target. HarfBuzz registers each callback in
 * the WebAssembly function table, so one set serves every glyph.
 */
function outlineDrawFuncs(hb: HarfBuzz): HarfBuzzModule.DrawFuncs {
  if (outlineDrawing) return outlineDrawing
  const target = (data: unknown) => data as OutlineTarget
  const x = (data: OutlineTarget, value: number) => value * data.scale
  const y = (data: OutlineTarget, value: number) => data.baseline - value * data.scale
  const draw = new hb.DrawFuncs()
  draw.setMoveToFunc((px, py, data) => {
    const t = target(data)
    t.commands.push({ type: 'M', x: x(t, px), y: y(t, py) })
  })
  draw.setLineToFunc((px, py, data) => {
    const t = target(data)
    t.commands.push({ type: 'L', x: x(t, px), y: y(t, py) })
  })
  draw.setQuadraticToFunc((cx, cy, px, py, data) => {
    const t = target(data)
    t.commands.push({ type: 'Q', x1: x(t, cx), y1: y(t, cy), x: x(t, px), y: y(t, py) })
  })
  draw.setCubicToFunc((c1x, c1y, c2x, c2y, px, py, data) => {
    const t = target(data)
    t.commands.push({
      type: 'C',
      x1: x(t, c1x),
      y1: y(t, c1y),
      x2: x(t, c2x),
      y2: y(t, c2y),
      x: x(t, px),
      y: y(t, py)
    })
  })
  draw.setClosePathFunc((data) => target(data).commands.push({ type: 'Z' }))
  outlineDrawing = draw
  return draw
}

/**
 * The outline of `glyphId`, scaled from font units to `fontSize` with y running down from the
 * baseline at `baseline`.
 */
export function glyphCommands(
  parsed: HarfBuzzFont,
  font: HarfBuzzModule.Font,
  glyphId: number,
  fontSize: number,
  baseline = 0
): OutlineCommand[] {
  const target: OutlineTarget = { commands: [], scale: fontSize / parsed.face.upem, baseline }
  font.drawGlyph(glyphId, outlineDrawFuncs(parsed.hb), target)
  return target.commands
}
