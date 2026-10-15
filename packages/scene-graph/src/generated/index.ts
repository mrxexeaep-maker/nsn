import type { SceneGraph } from '../index'
import type { NodeType, SceneNode } from '../types'

/**
 * Layers Figma generates from a template, which it calls immutable frames: their sublayers come
 * from the type and its settings, and a user edits them only through the frame. A sticky note's
 * body and author are such sublayers. They are real children here, so layout, drawing and text
 * editing treat them as any other layer, but nothing may add, move or remove them.
 */
export const GENERATED_FRAME_TYPES: ReadonlySet<NodeType> = new Set(['STICKY'])

export function isGeneratedFrame(node: Pick<SceneNode, 'type'>): boolean {
  return GENERATED_FRAME_TYPES.has(node.type)
}

/** The generated frame a layer belongs to, if it is one of its sublayers. */
export function generatedFrameOwner(graph: SceneGraph, node: SceneNode): SceneNode | undefined {
  let current = node.parentId ? graph.nodes.get(node.parentId) : undefined
  while (current) {
    if (isGeneratedFrame(current)) return current
    current = current.parentId ? graph.nodes.get(current.parentId) : undefined
  }
  return undefined
}

export * from './sticky'
