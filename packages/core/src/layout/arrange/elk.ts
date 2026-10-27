import type { ELK, ElkNode } from 'elkjs/lib/elk-api'

/** A worker a runtime can stop counting as a reason to stay alive, as Bun's can. */
interface Unreffable {
  ref(): void
  unref(): void
}

function unreffable(worker: Worker): (Worker & Unreffable) | null {
  return 'ref' in worker && 'unref' in worker ? (worker as Worker & Unreffable) : null
}

interface Engine {
  elk: ELK
  /** ELK's worker, when it has one the runtime would otherwise wait for. */
  worker: () => Unreffable | null
}

let engine: Promise<Engine> | null = null
/** Layouts in flight. */
let running = 0

/**
 * ELK in a worker of its own, so a large diagram does not hold up the page, or, where a runtime
 * has no workers, in place.
 */
async function load(): Promise<Engine> {
  if (typeof Worker === 'undefined') {
    const { default: BundledELK } = await import('elkjs/lib/elk.bundled.js')
    return { elk: new BundledELK(), worker: () => null }
  }
  const { default: WorkerELK } = await import('elkjs/lib/elk-api.js')
  let held: Unreffable | null = null
  const elk = new WorkerELK({
    workerFactory: () => {
      const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
      held = unreffable(worker)
      // An idle worker must not keep a script or command from finishing.
      held?.unref()
      return worker
    }
  })
  return { elk, worker: () => held }
}

function elkEngine(): Promise<Engine> {
  engine ??= load().catch((error: unknown) => {
    engine = null
    throw error
  })
  return engine
}

/**
 * Lays `graph` out with the Eclipse Layout Kernel, loaded on first use and kept for later
 * layouts. Its worker, where it has one, keeps the process alive only while a layout runs.
 */
export async function layoutWithElk(graph: ElkNode): Promise<ElkNode> {
  const { elk, worker } = await elkEngine()
  const layout = elk.layout(graph)
  if (running++ === 0) worker()?.ref()
  try {
    return await layout
  } finally {
    if (--running === 0) worker()?.unref()
  }
}
