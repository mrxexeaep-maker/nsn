import * as v from 'valibot'

import { withBatch } from '#core/tools/batch/define'
import { defineTool } from '#core/tools/schema'

export const listCollections = defineTool({
  name: 'list_collections',
  description: 'List all variable collections.',
  execution: { kind: 'sync', mutation: 'none' },
  input: v.strictObject({}),
  execute: (figma) => {
    const collections = figma.getLocalVariableCollections()
    return { count: collections.length, collections }
  }
})

export const getCollection = withBatch(
  defineTool({
    name: 'get_collection',
    description: 'Get a variable collection by ID.',
    execution: { kind: 'sync', mutation: 'none' },
    exposure: { webmcp: false },
    input: v.strictObject({
      id: v.pipe(v.string(), v.description('Collection ID'))
    }),
    execute: (figma, { id }) => {
      const collection = figma.getVariableCollectionById(id)
      if (!collection) return { error: `Collection "${id}" not found` }
      return {
        ...collection,
        activeModeId: figma.graph.getActiveModeId(id)
      }
    }
  }),
  { target: 'id' }
)

export const createCollection = withBatch(
  defineTool({
    name: 'create_collection',

    description: 'Create a new variable collection.',
    execution: { kind: 'sync', mutation: 'document' },
    input: v.strictObject({
      name: v.pipe(v.string(), v.description('Collection name'))
    }),
    execute: (figma, { name }) => {
      return figma.createVariableCollection(name)
    }
  })
)

export const deleteCollection = withBatch(
  defineTool({
    name: 'delete_collection',

    description: 'Delete a variable collection and all its variables.',
    execution: { kind: 'sync', mutation: 'document' },
    input: v.strictObject({
      id: v.pipe(v.string(), v.description('Collection ID'))
    }),
    execute: (figma, { id }) => {
      if (!figma.getVariableCollectionById(id)) return { error: `Collection "${id}" not found` }
      figma.deleteVariableCollection(id)
      return { deleted: id }
    }
  }),
  { target: 'id' }
)
