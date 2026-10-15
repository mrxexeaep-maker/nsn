import type { NodeChange } from '@open-pencil/kiwi/fig/codec'
import {
  buildStickySublayers,
  STICKY_SUBLAYER_LAYOUT,
  stickyFrameFields,
  stickyScale
} from '@open-pencil/scene-graph'
import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'

import { cloneRecord } from '../clone'
import { nodeChangeToProps } from '../convert'
import { convertFills } from '../paint'
import { derivedFrameEntriesOf, generationOverridesOf, STICKY_SLOTS } from './records'
import type { GeneratedEntry } from './records'

/** A sublayer as a whole TEXT record: what the user set, placed and shaped as Figma derived it. */
function sublayerRecord(entry: GeneratedEntry | undefined, derived: GeneratedEntry | undefined) {
  const { guidPath: _set, ...fields } = cloneRecord(entry ?? {})
  const record: NodeChange = { ...fields, type: 'TEXT' }
  if (derived?.size) record.size = cloneRecord(derived.size)
  if (derived?.transform) record.transform = cloneRecord(derived.transform)
  if (derived?.derivedTextData) record.derivedTextData = cloneRecord(derived.derivedTextData)
  return record
}

function sublayerProps(
  entry: GeneratedEntry | undefined,
  derived: GeneratedEntry | undefined,
  blobs: Uint8Array[]
): Partial<SceneNode> {
  const {
    nodeType: _type,
    name: _name,
    ...props
  } = nodeChangeToProps(sublayerRecord(entry, derived), blobs, 'occurrence')
  return { ...props, ...STICKY_SUBLAYER_LAYOUT }
}

/**
 * Gives an imported STICKY the sublayers its record describes. The note's colour is its
 * background's fill, which the note itself carries here; its layout comes from the template at
 * the scale its author line was set in.
 */
export function materializeStickyContent(
  graph: SceneGraph,
  sticky: SceneNode,
  record: NodeChange,
  blobs: Uint8Array[]
): void {
  const overrides = generationOverridesOf(record)
  const derived = derivedFrameEntriesOf(record)
  const { background, body, author } = STICKY_SLOTS
  const bodyProps = sublayerProps(overrides.get(body), derived.get(body), blobs)
  const authorProps = sublayerProps(overrides.get(author), derived.get(author), blobs)
  const scale = overrides.has(author) ? stickyScale({ fontSize: authorProps.fontSize ?? 0 }) : 1
  graph.updateNode(sticky.id, {
    fills: convertFills(overrides.get(background)?.fillPaints),
    ...stickyFrameFields(scale)
  })
  buildStickySublayers(graph, sticky, { scale }, { body: bodyProps, author: authorProps })
}
