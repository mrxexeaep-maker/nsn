import * as v from 'valibot'

import type { FigmaNodeProxy } from '#core/figma-api'
import { arrangeDiagram } from '#core/layout/diagram/arrange'
import { toolNumber, defineTool } from '#core/tools/schema'

export const arrangeNodes = defineTool({
  name: 'arrange',

  description:
    'Arrange top-level nodes on the canvas in a grid, row, or column layout. Useful after batch creation to tidy up overlapping frames.',
  execution: { kind: 'sync', mutation: 'document' },
  input: v.strictObject({
    ids: v.optional(
      v.pipe(
        v.array(v.string()),
        v.minLength(1),
        v.description('Node IDs to arrange (default: all top-level children)')
      )
    ),
    mode: v.optional(
      v.pipe(v.picklist(['grid', 'row', 'column']), v.description('Layout mode')),
      'grid'
    ),
    gap: v.optional(
      toolNumber(v.pipe(v.number(), v.description('Spacing between nodes (default: 40)')))
    ),
    cols: v.optional(
      toolNumber(
        v.pipe(
          v.number(),
          v.integer(),
          v.minValue(1),
          v.description('Column count for grid mode (default: auto)')
        )
      )
    )
  }),
  execute: (figma, args) => {
    const gap = args.gap ?? 40
    const mode = args.mode
    const page = figma.currentPage

    let nodes: FigmaNodeProxy[]
    if (args.ids && args.ids.length > 0) {
      nodes = args.ids
        .map((id) => figma.getNodeById(id))
        .filter((node): node is FigmaNodeProxy => node !== null)
    } else {
      nodes = [...page.children]
    }

    if (nodes.length === 0) return { error: 'No nodes to arrange' }
    const first = nodes[0]

    if (mode === 'row') {
      arrangeRow(nodes, first.x, first.y, gap)
    } else if (mode === 'column') {
      arrangeColumn(nodes, first.x, first.y, gap)
    } else {
      arrangeGrid(nodes, first.x, first.y, args.cols ?? Math.ceil(Math.sqrt(nodes.length)), gap)
    }

    return { arranged: nodes.length, mode }
  }
})

function arrangeRow(nodes: FigmaNodeProxy[], startX: number, y: number, gap: number) {
  let x = startX
  for (const node of nodes) {
    node.x = x
    node.y = y
    x += node.width + gap
  }
}

function arrangeColumn(nodes: FigmaNodeProxy[], x: number, startY: number, gap: number) {
  let y = startY
  for (const node of nodes) {
    node.x = x
    node.y = y
    y += node.height + gap
  }
}

function arrangeGrid(
  nodes: FigmaNodeProxy[],
  startX: number,
  startY: number,
  cols: number,
  gap: number
) {
  let x = startX
  let y = startY
  let rowHeight = 0

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    if (index > 0 && index % cols === 0) {
      x = startX
      y += rowHeight + gap
      rowHeight = 0
    }
    node.x = x
    node.y = y
    x += node.width + gap
    rowHeight = Math.max(rowHeight, node.height)
  }
}

export const arrangeDiagramTool = defineTool({
  name: 'arrange_diagram',

  description:
    'Lay out layers joined by connectors as a diagram, so nothing overlaps and connectors run between layers rather than through them: layers in ranks along the flow, each chosen section around the chosen layers it holds, and each elbowed connector rerouted with right-angled bends. Connectors between the layers are found automatically. Use it after drawing shapes and connectors by hand; the drawing keeps its top-left corner.',
  execution: { kind: 'async', mutation: 'document' },
  input: v.strictObject({
    ids: v.pipe(
      v.array(v.string()),
      v.minLength(1),
      v.description(
        'Layers to lay out, sharing a parent; include a section and all its children to lay them out inside it'
      )
    ),
    direction: v.optional(
      v.pipe(
        v.picklist(['TB', 'BT', 'LR', 'RL']),
        v.description('Flow: top to bottom (default), bottom to top, left to right, right to left')
      ),
      'TB'
    )
  }),
  execute: async (figma, args) => {
    try {
      return await arrangeDiagram(figma.graph, args.ids, args.direction)
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }
})
