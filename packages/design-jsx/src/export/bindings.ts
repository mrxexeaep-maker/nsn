import { isEqual } from 'es-toolkit'

import type { SceneNode } from '@open-pencil/scene-graph'

import {
  PADDING_FIELDS,
  paintProps,
  scalarProps,
  type BindingContext,
  type BoundProp
} from '../variables/props'
import type { JSXProp, JSXValue } from './value'
import type { VariableExport } from './variables'

/** Sizes are not added when the export left them out, as a fixed size would replace Hug or Fill. */
const NOT_ADDED = new Set(['width', 'height'])

function bindingContext(node: SceneNode): BindingContext {
  return {
    text: node.type === 'TEXT',
    grid: node.layoutMode === 'GRID',
    wrap: node.layoutWrap === 'WRAP'
  }
}

/**
 * The prop `field` is written through on `node`: one the export printed that sets that field
 * alone, or else the last number prop that does, as rendering reads it, or none, when only
 * `bind` can set it. A paint prop is printed only for a single solid paint, which a colour
 * variable can stand for.
 */
function fieldProp(node: SceneNode, field: string, props: JSXProp[]) {
  const context = bindingContext(node)
  const sets = ({ fields }: BoundProp) => fields.length === 1 && fields[0] === field
  const scalar = scalarProps(context).filter(sets)
  const printed = [...scalar, ...paintProps(context).filter(sets)].find(({ prop }) =>
    props.some(([name]) => name === prop)
  )
  if (printed) return { prop: printed.prop, add: false }
  const last = scalar.at(-1)
  return last && !NOT_ADDED.has(field) ? { prop: last.prop, add: true } : undefined
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
  const paddingProps = new Set(
    scalarProps(bindingContext(node))
      .filter(({ fields }) => fields.every((field) => PADDING_FIELDS.includes(field)))
      .map(({ prop }) => prop)
  )
  for (let index = props.length - 1; index >= 0; index--) {
    if (paddingProps.has(props[index][0])) props.splice(index, 1)
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
