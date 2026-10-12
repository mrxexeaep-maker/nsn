import { hasBehaviour, instanceMainComponent, type SceneGraph } from '@open-pencil/scene-graph'

import type { EditorContext } from '#core/editor/types'
import { findPageId } from '#core/io/subgraph'

import { playIslandRoots } from './islands'

/** A previewing canvas: its islands remount whenever the revision changes. */
export interface PlayState {
  revision: number
}

export interface PlayOptions {
  /** Loads a page's layers without switching to it. */
  loadPageNodes?: (pageId: string) => Promise<void>
}

/**
 * The other pages that hold the component sets the controls on `pageId` switch between. A
 * file loads a page's layers when the page is visited, so until then a set holds only the
 * variants pages already shown use, and a control could not switch to the rest.
 */
export function controlSetPages(graph: SceneGraph, pageId: string): string[] {
  const pages = new Set<string>()
  const visit = (id: string): void => {
    for (const node of graph.getChildren(id)) {
      if (node.type === 'INSTANCE' && hasBehaviour(graph, node)) {
        const component = instanceMainComponent(graph, node)
        const set = component?.parentId ? graph.getNode(component.parentId) : undefined
        const page = set?.type === 'COMPONENT_SET' ? findPageId(graph, set.id) : null
        if (page && page !== pageId) pages.add(page)
      }
      visit(node.id)
    }
  }
  for (const rootId of playIslandRoots(graph, pageId)) visit(rootId)
  return [...pages]
}

export function createPlayActions(ctx: EditorContext, options: PlayOptions = {}) {
  /** Preview this canvas: layers holding controls run as live components. */
  function startPlay(): void {
    if (ctx.state.play) return
    ctx.state.play = { revision: 0 }
    ctx.state.hoveredNodeId = null
    ctx.requestRepaint()
    // The islands follow the graph, so variants loaded after they mount reach them.
    for (const pageId of controlSetPages(ctx.graph, ctx.state.currentPageId)) {
      options.loadPageNodes?.(pageId).catch((error: unknown) => {
        console.warn('Could not load the page of a control’s component set', error)
      })
    }
  }

  /** Go back to editing; the canvas draws every layer again. */
  function stopPlay(): void {
    if (!ctx.state.play) return
    ctx.state.play = null
    ctx.requestRepaint()
  }

  function togglePlay(): void {
    if (ctx.state.play) stopPlay()
    else startPlay()
  }

  /** Put every control back as designed by running the islands afresh. */
  function resetPlay(): void {
    if (ctx.state.play) ctx.state.play = { revision: ctx.state.play.revision + 1 }
  }

  // Another document's layers start from their designed state, not from the old islands'.
  ctx.onEditorEvent('graph:replaced', resetPlay)

  return { startPlay, stopPlay, togglePlay, resetPlay }
}
