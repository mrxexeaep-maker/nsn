import {
  isSelectionScopeTool,
  SELECTION_SCOPE_FILE_OUTPUT_ERROR,
  SELECTION_SCOPE_TOOLS
} from '@open-pencil/mcp/tools'

import type { EditorStore } from '@/app/editor/active-store'

/** Tools that read the selection itself when a call names no nodes. */
const READS_SELECTION_BY_DEFAULT: ReadonlySet<string> = new Set(['describe', 'export_image'])

function namedIds(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return []
}

/**
 * A tool call's arguments limited to the user's selection, for an MCP server that shares only the
 * selection: every node the call names must be a selected layer or inside one, and `describe` and
 * `export_image` read the selection when they name none. Throws when the call reaches further.
 */
export function limitToSelection(
  store: EditorStore,
  toolName: string,
  toolArgs: Record<string, unknown>
): Record<string, unknown> {
  if (!isSelectionScopeTool(toolName)) {
    throw new Error(`${toolName} is unavailable while OpenPencil shares only the selection`)
  }
  // The MCP side writes a `path` to disk, which the selection does not extend to.
  if (toolArgs.path !== undefined) throw new Error(SELECTION_SCOPE_FILE_OUTPUT_ERROR)
  const fields = SELECTION_SCOPE_TOOLS[toolName]
  const selected = [...store.state.selectedIds]
  if (selected.length === 0) {
    throw new Error('Nothing is selected in OpenPencil. Ask the user to select the layers to use.')
  }

  if (toolArgs.items !== undefined) {
    if (toolName !== 'get_node' || !Array.isArray(toolArgs.items) || toolArgs.items.length === 0)
      throw new Error('This selection-scoped tool does not accept these batch items')
    if (Object.keys(toolArgs).some((key) => key !== 'items'))
      throw new Error('Use items alone for per-target reads')
    for (const item of toolArgs.items) {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        throw new Error('Each batch item must name a selected node')
      if (typeof item.id !== 'string' || item.items !== undefined)
        throw new Error('Each batch item must name one node with id')
      limitToSelection(store, toolName, item)
    }
    return toolArgs
  }

  const ids = fields.flatMap((field) => namedIds(toolArgs[field]))
  for (const id of ids) {
    if (!selected.some((root) => store.graph.isDescendant(id, root))) {
      throw new Error(`${id} is outside the selection OpenPencil shares; use get_selection`)
    }
  }
  if (ids.length > 0 || fields.length === 0) return toolArgs
  if (READS_SELECTION_BY_DEFAULT.has(toolName)) return { ...toolArgs, ids: selected }
  throw new Error(`${toolName} needs ${fields.join(' or ')}: a node from get_selection`)
}
