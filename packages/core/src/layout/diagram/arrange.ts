import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'

import { applyDiagramLayout } from './apply'
import { layoutDiagram, type DiagramDirection, type DiagramEdge, type DiagramInput } from './index'
import { connectorLabelSize } from './routes'

/** What an arrangement moved. */
export interface DiagramArrangement {
  /** Layers laid out as boxes. */
  nodes: number
  /** Sections laid out around what they hold. */
  groups: number
  /** Connectors routed along the layout. */
  connectors: number
}

/**
 * A chosen section lays out around its children when all of them were chosen too; a section
 * holding anything else moves as one box, so what was not chosen stays as it was.
 */
function groupsAmong(graph: SceneGraph, chosen: Set<string>): Set<string> {
  const groups = new Set<string>()
  for (const id of chosen) {
    const node = graph.getNode(id)
    if (node?.type !== 'SECTION') continue
    const children = graph.getChildren(id).filter((child) => child.type !== 'CONNECTOR')
    if (children.length > 0 && children.every((child) => chosen.has(child.id))) groups.add(id)
  }
  return groups
}

/** The chosen layer a connector end joins: the layer itself, or the nearest chosen ancestor. */
function chosenOwner(graph: SceneGraph, nodeId: string, chosen: Set<string>): string | null {
  for (
    let node = graph.getNode(nodeId);
    node;
    node = node.parentId ? graph.getNode(node.parentId) : undefined
  ) {
    if (chosen.has(node.id)) return node.id
  }
  return null
}

/**
 * Lays the layers `ids` out as a diagram with ELK, along the connectors that join them: each
 * layer a box at its own size, each chosen section around the chosen layers it holds, and each
 * connector between two of them a route in `direction`. The drawing keeps its top-left corner.
 * Layers not inside a chosen section must share a parent. Connectors are found, not chosen; one
 * joined to a layer inside a chosen box shapes the layout but keeps its ends.
 */
export async function arrangeDiagram(
  graph: SceneGraph,
  ids: string[],
  direction: DiagramDirection
): Promise<DiagramArrangement> {
  const nodes = ids
    .map((id) => graph.getNode(id))
    .filter(
      (node): node is SceneNode =>
        node !== undefined && node.type !== 'CONNECTOR' && node.type !== 'CANVAS'
    )
  const chosen = new Set(nodes.map((node) => node.id))
  const groups = groupsAmong(graph, chosen)
  const inGroup = (node: SceneNode) => node.parentId !== null && groups.has(node.parentId)
  const top = nodes.filter((node) => !inGroup(node))
  const parentIds = new Set(top.map((node) => node.parentId))
  if (parentIds.size > 1) {
    throw new Error('Layers to arrange must share a parent, apart from those in chosen sections')
  }
  const pageId = top[0] ? graph.pageOf(top[0].id) : null
  if (!pageId || top.length === 0) {
    return { nodes: 0, groups: 0, connectors: 0 }
  }

  const edges: DiagramEdge[] = []
  const connectors = new Map<string, string>()
  for (const { node } of graph.flattenTree(pageId)) {
    if (node.type !== 'CONNECTOR') continue
    const startId = node.connectorStart?.nodeId
    const endId = node.connectorEnd?.nodeId
    if (!startId || !endId) continue
    const from = chosenOwner(graph, startId, chosen)
    const to = chosenOwner(graph, endId, chosen)
    if (!from || !to || from === to) continue
    const label = connectorLabelSize(graph, node.id)
    edges.push({ id: node.id, from, to, label: label ?? undefined })
    // Only a connector joined to the boxes themselves is rerouted; one joined inside a box keeps
    // where it attaches.
    if (from === startId && to === endId) connectors.set(node.id, node.id)
  }

  const input: DiagramInput = {
    direction,
    nodes: nodes
      .filter((node) => !groups.has(node.id))
      .map((node) => ({
        id: node.id,
        width: node.width,
        height: node.height,
        group: inGroup(node) ? (node.parentId ?? undefined) : undefined
      })),
    groups: nodes
      .filter((node) => groups.has(node.id))
      .map((node) => ({
        id: node.id,
        group: inGroup(node) ? (node.parentId ?? undefined) : undefined
      })),
    edges
  }
  const topLeft = {
    x: Math.min(...top.map((node) => node.x)),
    y: Math.min(...top.map((node) => node.y))
  }
  const layout = await layoutDiagram(input)
  applyDiagramLayout(
    graph,
    input,
    layout,
    { boxes: new Map(nodes.map((node) => [node.id, node.id])), connectors },
    { topLeft }
  )
  return { nodes: input.nodes.length, groups: input.groups.length, connectors: connectors.size }
}
