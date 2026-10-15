import { pick } from 'es-toolkit'

import { stickySublayers } from '@open-pencil/scene-graph'
import type { SceneNode } from '@open-pencil/scene-graph'

import { generatedSlotPath, STICKY_SLOTS } from '../generated/records'
import type { GeneratedEntry } from '../generated/records'
import { createFillPaints } from './context'
import type { KiwiNodeChange, SceneNodeToKiwiContext } from './context'
import { serializeText } from './text'

/**
 * The fields a STICKY's own record keeps, as Figma writes it. Its colour, text and layout live in
 * its sublayers' entries, so the fields the note carries here as an auto layout frame stay out.
 */
const STICKY_RECORD_FIELDS = [
  'guid',
  'parentIndex',
  'phase',
  'type',
  'name',
  'visible',
  'opacity',
  'blendMode',
  'locked',
  'size',
  'transform',
  'effects',
  'autoRename',
  'frameMaskDisabled',
  'exportSettings',
  'pluginData',
  'pluginRelaunchData'
] as const

function placement(node: SceneNode): Pick<GeneratedEntry, 'size' | 'transform'> {
  return {
    size: { x: node.width, y: node.height },
    transform: { m00: 1, m01: 0, m02: node.x, m10: 0, m11: 1, m12: node.y }
  }
}

/** A text sublayer's entry, and its placement and glyphs as Figma would derive them. */
function textSublayer(
  context: SceneNodeToKiwiContext,
  slot: number,
  node: SceneNode
): { entry: GeneratedEntry; derived: GeneratedEntry } {
  const fields: KiwiNodeChange = {}
  serializeText(context, node, fields)
  const { derivedTextData, ...text } = fields
  const entry: GeneratedEntry = {
    ...text,
    guidPath: generatedSlotPath(slot),
    visible: node.visible,
    fillPaints: createFillPaints(context, node)
  }
  const derived: GeneratedEntry = { guidPath: generatedSlotPath(slot), ...placement(node) }
  if (derivedTextData) derived.derivedTextData = derivedTextData
  return { entry, derived }
}

/** Whether a sublayer's derived text can stand in for Figma's: shaped, unless it has no text. */
function shaped(node: SceneNode, derived: GeneratedEntry): boolean {
  return node.text === '' || (derived.derivedTextData?.glyphs?.length ?? 0) > 0
}

/**
 * Whether a layer is written as a generated frame: a note whose sublayers are the template's.
 * One that lost them is written as a plain frame with its children, so nothing it shows is lost.
 */
export function writesGeneratedFrame(context: SceneNodeToKiwiContext, node: SceneNode): boolean {
  return node.type === 'STICKY' && stickySublayers(context.graph, node) !== null
}

/**
 * A generated frame's record, with its sublayers written on it as Figma stores a sticky note: what
 * each sublayer shows under `nodeGenerationData`, and the layout derived from it under
 * `derivedImmutableFrameData`. Figma draws a note from its derived data as saved and lays it out
 * afresh only without it, so the export writes that data only when it has shaped every text.
 */
export function generatedFrameRecord(
  context: SceneNodeToKiwiContext,
  node: SceneNode,
  nc: KiwiNodeChange
): KiwiNodeChange | null {
  const sublayers = node.type === 'STICKY' ? stickySublayers(context.graph, node) : null
  if (!sublayers) return null
  const record: KiwiNodeChange = pick(nc, STICKY_RECORD_FIELDS)
  const fillPaints = createFillPaints(context, node)
  const background: GeneratedEntry = {
    guidPath: generatedSlotPath(STICKY_SLOTS.background),
    fillPaints,
    cornerRadius: 0
  }
  const overrides: GeneratedEntry[] = [background]
  const derived: GeneratedEntry[] = [
    { guidPath: generatedSlotPath(STICKY_SLOTS.background), ...placement({ ...node, x: 0, y: 0 }) }
  ]
  let complete = true
  for (const [slot, layer] of [
    [STICKY_SLOTS.body, sublayers.body],
    [STICKY_SLOTS.author, sublayers.author]
  ] as const) {
    const text = textSublayer(context, slot, layer)
    overrides.push(text.entry)
    derived.push(text.derived)
    complete &&= shaped(layer, text.derived)
  }
  record.nodeGenerationData = { overrides, useFineGrainedSyncing: false, diffOnlyRemovals: [] }
  if (complete) record.derivedImmutableFrameData = { overrides: derived, version: 1 }
  return record
}
