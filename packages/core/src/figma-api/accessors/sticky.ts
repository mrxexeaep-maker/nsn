import {
  isGeneratedFrame,
  isWideSticky,
  stickyScale,
  stickySublayers,
  stickyWidth
} from '@open-pencil/scene-graph'
import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'

import {
  graph,
  raw,
  updateNode,
  type NodeProxyInternals,
  type ProxyThis
} from '#core/figma-api/accessor-utils'
import type { FigmaNodeProxy, NodeProxyHost } from '#core/figma-api/proxy'

/**
 * The layers a script sees inside a node. A generated frame, such as a sticky note, shows none:
 * Figma reaches its text through `text`, not `children`.
 */
export function pluginChildren(sceneGraph: SceneGraph, id: string): SceneNode[] {
  const node = sceneGraph.getNode(id)
  return node && isGeneratedFrame(node) ? [] : sceneGraph.getChildren(id)
}

function sublayers(target: ProxyThis, internals: NodeProxyInternals) {
  const node = raw(target, internals)
  return node.type === 'STICKY' ? stickySublayers(graph(target, internals), node) : null
}

function wrap(target: ProxyThis, internals: NodeProxyInternals, id: string): FigmaNodeProxy {
  return (target[internals.api] as NodeProxyHost).wrapNode(id)
}

/** `StickyNode`'s members: its body as `text`, its author line, and its wide shape. */
export function installStickyNodeProxyAccessors(
  prototype: object,
  internals: NodeProxyInternals
): void {
  Object.defineProperties(prototype, {
    text: {
      get(this: ProxyThis): FigmaNodeProxy | undefined {
        const layers = sublayers(this, internals)
        return layers ? wrap(this, internals, layers.body.id) : undefined
      }
    },
    authorName: {
      get(this: ProxyThis): string | undefined {
        return sublayers(this, internals)?.author.text
      }
    },
    authorVisible: {
      get(this: ProxyThis): boolean | undefined {
        return sublayers(this, internals)?.author.visible
      },
      set(this: ProxyThis, value: boolean) {
        const author = sublayers(this, internals)?.author
        if (author) wrap(this, internals, author.id).visible = value
      }
    },
    isWideWidth: {
      get(this: ProxyThis): boolean | undefined {
        const node = raw(this, internals)
        return node.type === 'STICKY' ? isWideSticky(graph(this, internals), node) : undefined
      },
      set(this: ProxyThis, value: boolean) {
        const layers = sublayers(this, internals)
        if (!layers) return
        updateNode(this, internals, { width: stickyWidth(stickyScale(layers.author), value) })
      }
    }
  })
}
