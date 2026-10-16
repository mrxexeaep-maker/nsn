import type { Path } from 'canvaskit-wasm'

import { ResourceCache } from '#core/cache/resource'

/**
 * Points one node path cache keeps, about 64 MB of CanvasKit heap. A page of 20,000 icons with 100
 * points each takes half of it. A page larger than the cache keeps the paths it holds and rebuilds
 * only the rest on each recording, since node caches keep what the current frame uses.
 */
export const PATH_CACHE_POINTS = 4_000_000
export const PATH_CACHE_ENTRIES = 65_536
/** Weight of a path beyond its points, so many tiny paths still count against the budget. */
const PATH_OVERHEAD_POINTS = 8

export interface PathCacheLimits {
  maxPoints?: number
  maxEntries?: number
  /** See `ResourceCacheOptions.protectFrames`. */
  protectFrames?: boolean
}

type CachedPaths = Path | Path[]

function pathWeight(value: CachedPaths): number {
  if (!Array.isArray(value)) return value.countPoints() + PATH_OVERHEAD_POINTS
  let weight = 0
  for (const path of value) weight += path.countPoints() + PATH_OVERHEAD_POINTS
  return weight
}

function deletePaths(value: CachedPaths): void {
  if (!Array.isArray(value)) value.delete()
  else for (const path of value) path.delete()
}

/** Owns cached paths, weighed by point count; evicted, replaced, and deleted entries delete them. */
export function createPathCache<K = string, V extends CachedPaths = Path[]>({
  maxPoints = PATH_CACHE_POINTS,
  maxEntries = PATH_CACHE_ENTRIES,
  protectFrames = false
}: PathCacheLimits = {}): ResourceCache<K, V> {
  return new ResourceCache<K, V>({
    maxEntries,
    maxWeight: maxPoints,
    protectFrames,
    weight: pathWeight,
    dispose: deletePaths
  })
}

export type NodePathCache = ResourceCache<string, Path[]>

/**
 * The paths a renderer builds for each node, keyed by node id (stroke outlines by `<nodeId>|…`).
 * The caches keep what the current frame used, so paths are never deleted while a frame draws
 * them. Paths a cache rejects stay here until `beginFrame`, which runs when a frame or
 * an export starts, so callers can draw them now without leaking them.
 */
export class NodePathCaches {
  readonly vector: NodePathCache
  readonly vectorStroke: NodePathCache
  readonly strokeOutline: NodePathCache
  readonly fillGeometry: NodePathCache
  readonly strokeGeometry: NodePathCache
  private readonly caches: readonly NodePathCache[]
  private uncached: Path[][] = []

  constructor(limits: Omit<PathCacheLimits, 'protectFrames'> = {}) {
    const options = { ...limits, protectFrames: true }
    this.vector = createPathCache(options)
    this.vectorStroke = createPathCache(options)
    this.strokeOutline = createPathCache(options)
    this.fillGeometry = createPathCache(options)
    this.strokeGeometry = createPathCache(options)
    this.caches = [
      this.vector,
      this.vectorStroke,
      this.strokeOutline,
      this.fillGeometry,
      this.strokeGeometry
    ]
  }

  /** Stores paths built for drawing; the caller borrows them until the next `beginFrame`. */
  store(cache: NodePathCache, key: string, paths: Path[]): void {
    if (!cache.set(key, paths)) this.uncached.push(paths)
  }

  /** Deletes every path built for a node. */
  invalidate(nodeId: string): void {
    for (const cache of this.caches) cache.delete(nodeId)
    const outlinePrefix = `${nodeId}|`
    this.strokeOutline.deleteWhere((_, key) => key.startsWith(outlinePrefix))
  }

  /** Starts a frame or an export: deletes the paths `store` could not cache. */
  beginFrame(): void {
    for (const cache of this.caches) cache.beginFrame()
    this.releaseUncached()
  }

  private releaseUncached(): void {
    const uncached = this.uncached
    if (uncached.length === 0) return
    this.uncached = []
    for (const paths of uncached) deletePaths(paths)
  }

  clear(): void {
    for (const cache of this.caches) cache.clear()
    this.releaseUncached()
  }
}
