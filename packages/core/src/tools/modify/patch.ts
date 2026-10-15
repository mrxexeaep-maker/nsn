import * as v from 'valibot'

import type { FigmaAPI } from '#core/figma-api'
import type { ToolDef } from '#core/tools/schema'

import { setOpacity, setRadius } from './geometry'
import { setLayout, setLayoutChild } from './layout'
import { setVisible } from './state'
import { setFont, setText, setTextProperties, setTextResize } from './text'
import { updateNode } from './update'

/** Legacy patch names use the same validators and setters as focused property tools. */
const groups: Array<{ tool: ToolDef; fields: Record<string, string> }> = [
  {
    tool: setLayout,
    fields: {
      spacing: 'spacing',
      padding: 'padding',
      padding_horizontal: 'padding_horizontal',
      padding_vertical: 'padding_vertical',
      counter_align: 'counter_align',
      align: 'align',
      direction: 'direction',
      flow_direction: 'flow_direction'
    }
  },
  {
    tool: setLayoutChild,
    fields: {
      sizing_horizontal: 'sizing_horizontal',
      sizing_vertical: 'sizing_vertical',
      grow: 'grow',
      align_self: 'align_self',
      positioning: 'positioning'
    }
  },
  {
    tool: updateNode,
    fields: {
      name: 'name',
      x: 'x',
      y: 'y',
      width: 'width',
      height: 'height',
      font_weight: 'font_weight'
    }
  },
  { tool: setText, fields: { text: 'text' } },
  { tool: setVisible, fields: { visible: 'value' } },
  { tool: setRadius, fields: { corner_radius: 'radius' } },
  { tool: setOpacity, fields: { opacity: 'value' } },
  { tool: setTextResize, fields: { auto_resize: 'mode' } },
  { tool: setFont, fields: { font_family: 'family', font_size: 'size', font_style: 'style' } },
  {
    tool: setTextProperties,
    fields: {
      text_direction: 'direction',
      align_horizontal: 'align_horizontal',
      align_vertical: 'align_vertical',
      text_decoration: 'text_decoration'
    }
  }
]

export const batchPropertiesInput = v.strictObject(
  Object.fromEntries(
    groups.flatMap(({ tool, fields }) =>
      Object.entries(fields).map(([name, field]) => {
        const schema = Object.hasOwn(tool.input.entries, field)
          ? tool.input.entries[field]
          : undefined
        if (!schema) throw new Error(`${tool.name} has no ${field} input`)
        return [name, v.optional(schema)]
      })
    )
  )
)

export function applyPropertyPatch(figma: FigmaAPI, id: string, props: Record<string, unknown>) {
  if (!figma.getNodeById(id)) throw new Error(`Node "${id}" not found`)
  const updated = Object.keys(props).filter((key) => props[key] !== undefined)
  if (!updated.length) throw new Error('Provide at least one supported property')
  for (const { tool, fields } of groups) {
    const values = Object.entries(fields)
      .filter(([name]) => props[name] !== undefined)
      .map(([name, field]) => [field, props[name]])
    if (!values.length) continue
    const result = tool.execute(figma, { id, ...Object.fromEntries(values) })
    if (result && typeof result === 'object' && 'error' in result)
      throw new Error(String(result.error))
  }
  return { id, updated }
}
