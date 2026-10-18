import { isEqual } from 'es-toolkit'

import type { SceneGraph } from '@open-pencil/scene-graph'
import type { UndoManager } from '@open-pencil/scene-graph/undo'

import type { EditorContext, Tool } from '#core/editor/types'

import { READ_ONLY_ACTIONS } from './actions'

export { READ_ONLY_ACTIONS }

/** Raised by an edit to a document that is open read-only, in Figma's words for its own. */
export class ReadOnlyDocumentError extends Error {
  constructor() {
    super("Can't edit the document in read-only mode")
    this.name = 'ReadOnlyDocumentError'
  }
}

/** The tools a read-only document keeps, as Figma's toolbar shows while a version is viewed. */
export const READ_ONLY_TOOLS: ReadonlySet<Tool> = new Set<Tool>(['SELECT', 'HAND'])

/**
 * Returns the editor with every action that changes the document refused while `isReadOnly`
 * holds; the actions in `READ_ONLY_ACTIONS` and the editor's getters pass through.
 */
export function guardReadOnly<T extends object>(editor: T, isReadOnly: () => boolean): T {
  const descriptors = Object.getOwnPropertyDescriptors(editor)
  for (const [name, descriptor] of Object.entries(descriptors)) {
    const action: unknown = descriptor.value
    if (typeof action !== 'function' || READ_ONLY_ACTIONS.has(name)) continue
    descriptor.value = (...args: unknown[]): unknown => {
      if (isReadOnly()) throw new ReadOnlyDocumentError()
      return Reflect.apply(action, undefined, args)
    }
  }
  return Object.defineProperties({}, descriptors) as T
}

/**
 * Returns the editor's undo history with undo and redo refused while `isReadOnly` holds, since
 * they change the document; batches and reads pass through for the gestures that open them.
 */
export function guardUndo(undo: UndoManager, isReadOnly: () => boolean): UndoManager {
  return new Proxy(undo, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key)
      if ((key === 'undo' || key === 'redo') && isReadOnly()) {
        return () => {
          throw new ReadOnlyDocumentError()
        }
      }
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}

/**
 * Runs `run` so that its first change to a layer of `graph` throws `ReadOnlyDocumentError` before it lands,
 * as Figma's scripts fail on a read-only document; reads go through. Variables change without
 * notice, so a run that changed them fails once it ends and they are put back. Covers what writes
 * the graph directly, such as scripts and tools, which the editor's guard does not see.
 */
export async function withoutDocumentWrites<T>(
  graph: SceneGraph,
  run: () => T | Promise<T>
): Promise<T> {
  const refuse = () => {
    throw new ReadOnlyDocumentError()
  }
  const stop = graph.observeNodeChanges({ before: refuse, created: refuse })
  const variables = structuredClone(graph.variables)
  const collections = structuredClone(graph.variableCollections)
  const variablesChanged = () =>
    !isEqual(variables, graph.variables) || !isEqual(collections, graph.variableCollections)
  try {
    const result = await run()
    if (variablesChanged()) throw new ReadOnlyDocumentError()
    return result
  } finally {
    stop()
    if (variablesChanged()) {
      replaceEntries(graph.variables, variables)
      replaceEntries(graph.variableCollections, collections)
    }
  }
}

function replaceEntries<K, V>(target: Map<K, V>, source: Map<K, V>) {
  target.clear()
  for (const [key, value] of source) target.set(key, value)
}

export function createReadOnlyActions(ctx: EditorContext, endEdits: () => void) {
  /**
   * Opens the document read-only or editable again. Going read-only ends what is being edited and
   * drops a tool that would edit, as Figma does on opening version history.
   */
  function setReadOnly(readOnly: boolean): void {
    if (ctx.state.readOnly === readOnly) return
    if (readOnly) {
      endEdits()
      if (!READ_ONLY_TOOLS.has(ctx.state.activeTool)) ctx.setActiveTool('SELECT')
    }
    ctx.state.readOnly = readOnly
    ctx.emitEditorEvent('document:read-only-changed', readOnly)
    ctx.requestRepaint()
  }

  return { setReadOnly }
}
