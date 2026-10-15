import * as v from 'valibot'

import type { VariableType, VariableValue } from '@open-pencil/scene-graph'
import { tryParseColor } from '@open-pencil/scene-graph/color'

import { withBatch } from '#core/tools/batch/define'
import { toolNumber } from '#core/tools/input'
import { defineTool } from '#core/tools/schema'

const valueInput = v.union([v.string(), v.number(), v.boolean()])

function parseVariableValue(type: VariableType, value: string | number | boolean): VariableValue {
  if (type === 'FLOAT') return v.parse(toolNumber(), value)
  if (type === 'BOOLEAN') {
    if (typeof value === 'boolean') return value
    return v.parse(
      v.pipe(
        v.picklist(['true', 'false']),
        v.transform((text) => text === 'true')
      ),
      value
    )
  }
  const text = v.parse(v.string(), value)
  if (type !== 'COLOR') return text
  const color = tryParseColor(text)
  if (!color) throw new Error(`Invalid color value "${text}"`)
  return color
}

export const createVariable = withBatch(
  defineTool({
    name: 'create_variable',

    description: 'Create a new variable in a collection.',
    execution: { kind: 'sync', mutation: 'document' },
    input: v.strictObject({
      name: v.pipe(v.string(), v.description('Variable name')),
      type: v.pipe(
        v.picklist(['COLOR', 'FLOAT', 'STRING', 'BOOLEAN']),
        v.description('Variable type')
      ),
      collection_id: v.pipe(v.string(), v.description('Collection ID')),
      value: v.optional(
        v.pipe(valueInput, v.description('Initial value: hex color, number, Boolean, or text.'))
      )
    }),
    execute: (figma, args) => {
      const type = args.type
      const parsedValue =
        args.value === undefined ? undefined : parseVariableValue(type, args.value)
      return figma.createVariable(args.name, type, args.collection_id, parsedValue)
    }
  })
)

export const setVariable = withBatch(
  defineTool({
    name: 'set_variable',

    description: 'Set the value of a variable for a specific mode.',
    execution: { kind: 'sync', mutation: 'properties' },
    input: v.strictObject({
      id: v.pipe(v.string(), v.description('Variable ID')),
      mode: v.pipe(v.string(), v.description('Mode ID')),
      value: v.pipe(valueInput, v.description('Value: hex color, number, Boolean, or text.'))
    }),
    execute: (figma, args) => {
      const variable = figma.getVariableById(args.id)
      if (!variable) return { error: `Variable "${args.id}" not found` }
      const collection = figma.getVariableCollectionById(variable.collectionId)
      if (!collection?.modes.some((mode) => mode.modeId === args.mode))
        throw new Error(`Mode "${args.mode}" does not belong to the variable's collection`)
      const parsedValue = parseVariableValue(variable.type, args.value)
      figma.setVariableValue(args.id, args.mode, parsedValue)
      return { id: args.id, mode: args.mode, value: parsedValue }
    }
  }),
  { target: 'id' }
)

export const deleteVariable = withBatch(
  defineTool({
    name: 'delete_variable',

    description: 'Delete a variable.',
    execution: { kind: 'sync', mutation: 'document' },
    input: v.strictObject({
      id: v.pipe(v.string(), v.description('Variable ID'))
    }),
    execute: (figma, { id }) => {
      if (!figma.getVariableById(id)) throw new Error(`Variable "${id}" not found`)
      figma.deleteVariable(id)
      return { deleted: id }
    }
  }),
  { target: 'id' }
)
