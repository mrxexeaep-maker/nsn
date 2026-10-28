import type { InstanceOccurrence } from '#fig/instance-overrides/occurrence/types'
import type { MaterializedComponentOccurrence } from '#fig/instance-overrides/source-children'

import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'

export interface ComponentCheckpoint {
  rootId: string
  nodes: Array<{ path: string[]; nodeId: string; mainComponentId: string | null }>
}

/** Paths use source identities at every hierarchy level, never names or child indexes. */
export function checkpointComponent(
  component: MaterializedComponentOccurrence
): ComponentCheckpoint {
  const nodes: ComponentCheckpoint['nodes'] = []
  const visit = (occurrence: InstanceOccurrence, path: string[]): void => {
    const node = component.materialized.nodes.get(occurrence)
    // Keep the last archive identity as a tombstone when the live node was deleted. This lets
    // export discover the deletion, while the recursive walk still preserves surviving children
    // that were reparented out of a deleted ancestor.
    if (!node && path.length === 0) throw new Error('Missing checkpoint occurrence')
    const nodeId = node?.id ?? component.deletedNodeIds?.get(occurrence)
    if (!nodeId) throw new Error('Missing checkpoint occurrence')
    nodes.push({ path, nodeId, mainComponentId: occurrence.mainComponentId })
    const ids = new Set<string>()
    for (const child of occurrence.children) {
      if (ids.has(child.sourceId)) throw new Error(`Ambiguous checkpoint child ${child.sourceId}`)
      ids.add(child.sourceId)
      visit(child, [...path, child.sourceId])
    }
  }
  visit(component.occurrence, [])
  return { rootId: component.materialized.root.id, nodes }
}

export function restoreComponentCheckpoint(
  graph: SceneGraph,
  occurrence: InstanceOccurrence,
  checkpoint: ComponentCheckpoint
): MaterializedComponentOccurrence {
  const root = graph.getNode(checkpoint.rootId)
  if (!root) throw new Error(`Missing resumed component ${checkpoint.rootId}`)
  const currentlyMaterialized = new Map<string, SceneNode>()
  const visitCurrent = (node: SceneNode, path: string[]): void => {
    currentlyMaterialized.set(path.join('/'), node)
    for (const child of graph.getChildren(node.id)) {
      const source = child.source.id
      if (source) visitCurrent(child, [...path, source])
    }
  }
  visitCurrent(root, [])
  const nodes = new Map<InstanceOccurrence, SceneNode>()
  const deletedNodeIds = new Map<InstanceOccurrence, string>()
  for (const entry of checkpoint.nodes) {
    let target = occurrence
    for (const id of entry.path) {
      const matches = target.children.filter((child) => child.sourceId === id)
      if (matches.length !== 1) throw new Error(`Invalid checkpoint source path ${id}`)
      target = matches[0]
    }
    if (
      nodes.has(target) ||
      deletedNodeIds.has(target) ||
      target.mainComponentId !== entry.mainComponentId
    ) {
      throw new Error(`Invalid checkpoint occurrence ${entry.nodeId}`)
    }
    const node = graph.getNode(entry.nodeId) ?? currentlyMaterialized.get(entry.path.join('/'))
    if (!node) {
      if (entry.path.length === 0) throw new Error(`Invalid checkpoint root ${entry.nodeId}`)
      deletedNodeIds.set(target, entry.nodeId)
      continue
    }
    nodes.set(target, node)
  }
  const validate = (target: InstanceOccurrence): void => {
    // Deleted loaded descendants are deliberate live structure, not checkpoint corruption.
    if (!nodes.has(target)) return
    for (const child of target.children) validate(child)
  }
  validate(occurrence)
  if (nodes.get(occurrence) !== root) throw new Error('Invalid checkpoint root')
  return { occurrence, materialized: { root, nodes }, deletedNodeIds }
}
