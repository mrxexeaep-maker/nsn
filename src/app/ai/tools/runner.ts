import { isEmptyDocumentChange } from '@open-pencil/core/editor'
import type { FigmaAPI } from '@open-pencil/core/figma-api'
import { isAtomicTool, toolChangesDocument, type ToolDef } from '@open-pencil/core/tools'
import type { SceneGraph } from '@open-pencil/scene-graph'

import { AUTOMATION_UNDO_LABEL, executeAtomicEditorTool } from '@/app/automation/execution/editor'
import type { EditorStore } from '@/app/editor/active-store'
import { ensureGraphFonts } from '@/app/editor/fonts'

import {
  AI_UNDO_PREFIX,
  markRunChange,
  moveRunToPage,
  recordRunBaseline,
  recordRunUndoEntry,
  type Run
} from '../reply/run'
import { recordToolChange } from './changes/capture'
import { createMutex } from './mutex'

/** The reply a call belongs to: its run, and the call's id in the reply's transcript. */
export interface ReplyCall {
  run: Run
  toolCallId: string
}

/** One call of an OpenPencil tool, from the built-in chat, a coding agent, or another client. */
export interface EditorToolCall {
  store: EditorStore
  figma: FigmaAPI
  def: ToolDef
  args: Record<string, unknown>
  /** The chat reply the call belongs to; a call from an outside client belongs to none. */
  reply?: ReplyCall | null
  /** What a call outside a reply labels its undo entry with, such as `Agent` or `WebMCP`. */
  source?: string
  signal?: AbortSignal
  /** False once the call's document closed, so a late edit is not drawn. */
  isLive?: () => boolean
}

export const STOPPED_BEFORE_CALL = 'Stopped before this call ran; nothing was changed.'

/** Each document's edits run one at a time, since whole-page snapshots must not interleave. */
const editLocks = new WeakMap<EditorStore, () => Promise<() => void>>()

function editLock(store: EditorStore): () => Promise<() => void> {
  let lock = editLocks.get(store)
  if (!lock) {
    lock = createMutex()
    editLocks.set(store, lock)
  }
  return lock
}

function pageIdOf(graph: SceneGraph, nodeId: string): string | null {
  let node = graph.getNode(nodeId)
  while (node && node.type !== 'CANVAS') {
    node = node.parentId ? graph.getNode(node.parentId) : undefined
  }
  return node?.id ?? null
}

/**
 * The page a call writes to: a parent or a replaced layer on another page puts the new layers
 * there, so that page lays out, loads their fonts, and records the change.
 */
function writtenPageId(figma: FigmaAPI, args: Record<string, unknown>): string {
  // As render places it: a replaced layer's parent wins over parent_id.
  const nodeId = args.replace_id ?? args.parent_id
  const pageId = typeof nodeId === 'string' ? pageIdOf(figma.graph, nodeId) : null
  return pageId ?? figma.currentPageId
}

async function execute(call: EditorToolCall, pageId: string, prefix: string): Promise<unknown> {
  const { store, figma, def, args } = call
  if (isAtomicTool(def)) {
    return executeAtomicEditorTool(store, figma, def, args, {
      label: prefix,
      signal: call.signal,
      isLive: call.isLive
    })
  }
  return store.runMutationWithLayout(
    () => def.execute(figma, args),
    pageId,
    async () => {
      const page = store.graph.getNode(pageId)
      if (page) await ensureGraphFonts(store.graph, page.childIds, store.renderer)
    }
  )
}

/** Records a reply's call once it ran: its undo entry, its change, and where its agent worked. */
async function recordReplyCall(
  call: EditorToolCall,
  reply: ReplyCall,
  change: ReturnType<ReturnType<EditorStore['captureDocumentChange']>>,
  undoBefore: ReturnType<EditorStore['undo']['peekUndo']>,
  viewPageId: string
): Promise<void> {
  const { store, figma, def } = call
  const { run, toolCallId } = reply
  if (!isEmptyDocumentChange(change)) run.changedCalls.add(toolCallId)
  recordRunUndoEntry(store, run, { tool: def.name, toolCallId }, undoBefore)
  // View tools (selection, viewport, pages) cannot change the document.
  if (toolChangesDocument(def)) {
    try {
      recordToolChange(store, toolCallId, change)
    } catch (error) {
      // The change record is a review aid; the edit and its undo entry already stand.
      console.warn('Could not record AI tool change', error)
    }
    // The agent shows where it edited, even on another page; layers the result names refine
    // this once the call returns.
    markRunChange(store, change)
  }
  // `switch_page` moves the run, and the user's view with it.
  if (figma.currentPageId !== viewPageId) await moveRunToPage(store, run, figma.currentPageId)
}

/**
 * Runs one call of an OpenPencil tool. An edit runs alone in its document, is recorded as one
 * undo entry, and, for a call that belongs to a chat reply, joins the reply's run so the reply
 * can revert it and the transcript shows what it changed.
 */
export async function runEditorTool(call: EditorToolCall): Promise<unknown> {
  const { store, figma, def, args } = call
  if (!def.mutates) return def.execute(figma, args)
  const reply = call.reply ?? null
  const release = await editLock(store)()
  // Stopped while waiting for its turn: the reply is over, so nothing more is edited.
  if (reply && !reply.run.active) {
    release()
    return { error: STOPPED_BEFORE_CALL }
  }
  reply?.run.beginTool()
  const viewPageId = figma.currentPageId
  const pageId = writtenPageId(figma, args)
  // A reply's first edit to a page keeps the whole page, which `changeBaseline` diffs.
  if (reply && toolChangesDocument(def) && !reply.run.baselines.has(pageId)) {
    recordRunBaseline(reply.run, store.snapshotPage(pageId))
  }
  const prefix = reply ? AI_UNDO_PREFIX : (call.source ?? AUTOMATION_UNDO_LABEL)
  const undoBefore = store.undo.peekUndo()
  const finishChange = store.captureDocumentChange(pageId)
  try {
    return await execute(call, pageId, prefix)
  } finally {
    const change = finishChange()
    // Atomic tools record their own entry; an edit that changed nothing records none.
    if (!isAtomicTool(def) && !isEmptyDocumentChange(change)) {
      store.pushUndoStep({
        label: `${prefix}: ${def.name}`,
        forward: () => store.restoreDocumentChange(change, 'after'),
        inverse: () => store.restoreDocumentChange(change, 'before')
      })
    }
    try {
      if (reply) await recordReplyCall(call, reply, change, undoBefore, viewPageId)
    } finally {
      release()
      reply?.run.endTool()
    }
  }
}
