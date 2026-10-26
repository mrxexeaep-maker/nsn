import { isEqual } from 'es-toolkit'

import type { SceneNode } from '@open-pencil/scene-graph'

import type { JSXProp, JSXValue } from './value'
import type { VariableExport } from './variables'

/**
 * The prop each bound field is written through, as rendering binds it back. `add` writes the prop
 * when the export left it out, such as a gap of 0; sizes are not added, as a fixed size would
 * replace Hug or Fill.
 */
const FIELD_PROPS: Record<string, { prop: string; add: boolean; text?: boolean }> = {
  width: { prop: 'w', add: false },
  height: { prop: 'h', add: false },
  itemSpacing: { prop: 'gap', add: true },
  gridColumnGap: { prop: 'columnGap', add: true },
  gridRowGap: { prop: 'rowGap', add: true },
  cornerRadius: { prop: 'rounded', add: true },
  topLeftRadius: { prop: 'roundedTL', add: true },
  topRightRadius: { prop: 'roundedTR', add: true },
  bottomLeftRadius: { prop: 'roundedBL', add: true },
  bottomRightRadius: { prop: 'roundedBR', add: true },
  strokeWeight: { prop: 'strokeWidth', add: true },
  opacity: { prop: 'opacity', add: true },
  fontSize: { prop: 'size', add: true, text: true },
  lineHeight: { prop: 'lineHeight', add: true, text: true },
  letterSpacing: { prop: 'letterSpacing', add: true, text: true }
}

const PADDING_FIELDS = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']
const PADDING_PROPS = new Set(['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl'])

/** The prop a field is written through on `node`, or none, when only `bind` can set it. */
function fieldProp(node: SceneNode, field: string, props: JSXProp[]) {
  if (field === 'fills/0/color') {
    // Only a single solid paint is written as a colour, which a variable can stand for.
    const prop = node.type === 'TEXT' ? 'color' : 'bg'
    return props.some(([name]) => name === prop) ? { prop, add: false } : undefined
  }
  if (field === 'strokes/0/color')
    return props.some(([name]) => name === 'stroke') ? { prop: 'stroke', add: false } : undefined
  if (field === 'counterAxisSpacing')
    return node.layoutWrap === 'WRAP' ? { prop: 'rowGap', add: true } : undefined
  const entry = Object.hasOwn(FIELD_PROPS, field) ? FIELD_PROPS[field] : undefined
  if (entry?.text && node.type !== 'TEXT') return undefined
  if (
    (field === 'itemSpacing' || field === 'counterAxisSpacing') &&
    node.gridTemplateColumns.length
  )
    return undefined
  return entry
}

function setProp(props: JSXProp[], name: string, value: JSXValue, add: boolean): boolean {
  const index = props.findIndex(([prop]) => prop === name)
  if (index !== -1) props[index] = [name, value]
  else if (add) props.push([name, value])
  return index !== -1 || add
}

/**
 * Write the padding again when a side is bound, each bound side as its variable, grouped as
 * `p`, `py` and `px`, or one prop per side, as the export groups literal padding.
 */
function writePadding(
  node: SceneNode,
  props: JSXProp[],
  remaining: Map<string, string>,
  variables: VariableExport,
  named: (variableId: string) => boolean
): void {
  const sides = PADDING_FIELDS.map((field): JSXValue => {
    const variableId = remaining.get(field)
    return variableId && named(variableId)
      ? variables.variable(variableId)
      : node[field as 'paddingTop']
  })
  if (sides.every((side) => typeof side === 'number')) return
  for (let index = props.length - 1; index >= 0; index--) {
    if (PADDING_PROPS.has(props[index][0])) props.splice(index, 1)
  }
  const [top, right, bottom, left] = sides
  if ([right, bottom, left].every((side) => isEqual(side, top))) props.push(['p', top])
  else if (isEqual(top, bottom) && isEqual(left, right)) props.push(['py', top], ['px', left])
  else {
    ;(['pt', 'pr', 'pb', 'pl'] as const).forEach((prop, index) => {
      if (sides[index] !== 0) props.push([prop, sides[index]])
    })
  }
  for (const field of PADDING_FIELDS) {
    const variableId = remaining.get(field)
    if (variableId && named(variableId)) remaining.delete(field)
  }
}

/**
 * Write the variables `node` binds through the props that set those fields, such as
 * `bg={theme.Surface}` and `p={density.Pad}`, and the rest in `bind`.
 */
export function collectBindingProps(
  node: SceneNode,
  props: JSXProp[],
  variables: VariableExport
): void {
  const remaining = new Map(Object.entries(node.boundVariables))
  // A variable only `bind` can name, by its ID, is not written in a prop, which reads a string.
  const named = (variableId: string) => typeof variables.variable(variableId) !== 'string'
  writePadding(node, props, remaining, variables, named)
  for (const [field, variableId] of remaining) {
    if (!named(variableId)) continue
    const target = fieldProp(node, field, props)
    if (target && setProp(props, target.prop, variables.variable(variableId), target.add))
      remaining.delete(field)
  }
  if (remaining.size === 0) return
  const bindings = [...remaining].toSorted(([a], [b]) => a.localeCompare(b))
  props.push([
    'bind',
    Object.fromEntries(bindings.map(([field, id]) => [field, variables.variable(id)]))
  ])
}

/** The modes a layer pins; one is written without a list. */
export function collectModeProps(node: SceneNode, props: JSXProp[], variables: VariableExport) {
  const modes = Object.entries(node.variableModes).map(([collectionId, modeId]) =>
    variables.mode(collectionId, modeId)
  )
  if (modes.length > 0) props.push(['mode', modes.length === 1 ? modes[0] : modes])
}
