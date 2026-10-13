import { useEditorCommands } from '@open-pencil/vue'
import type { EditorCommandId } from '@open-pencil/vue'

import { useEditorStore } from '@/app/editor/active-store'
import { clearRecentFiles, forgetRecentFile, recentLocalFileAt } from '@/app/recent-files'
import { isInputElement } from '@/app/shell/keyboard/focus'
import { createSharedEditorMenuActions } from '@/app/shell/menu/editor-actions'
import { openFileDialog, openFileFromPath } from '@/app/shell/menu/files'
import { useNativeMenuEvents } from '@/app/shell/menu/native-events'
import { OPEN_RECENT_EVENT_PREFIX, watchRecentFilesMenu } from '@/app/shell/menu/recent-files'
import { APP_MENU_SCHEMA, type AppMenuEntry } from '@/app/shell/menu/schema'
import { createSelectionMenuActions } from '@/app/shell/menu/selection-actions'
import { SHELL_MENU_IDS } from '@/app/shell/menu/shell'
import { useTextFieldFocus } from '@/app/shell/menu/text-field-focus'
import { useAppTheme } from '@/app/shell/theme'
import { saveDocumentToStorage } from '@/app/storage/workspace/save'
import { createTab, closeTab, activeTab } from '@/app/tabs'
import { isTauri } from '@/app/tauri/env'

function commandMenuIds(entries: readonly AppMenuEntry[]): EditorCommandId[] {
  return entries.flatMap((entry) => {
    if (entry.type === 'separator') return []
    return [...(entry.command ? [entry.command] : []), ...commandMenuIds(entry.sub ?? [])]
  })
}

/**
 * Native menu accelerators fire even when a text field has focus, because the WebView leaves
 * keys the page did not handle to the menu. These commands then edit the field, as Edit menu
 * items do in any macOS app, instead of the canvas.
 */
const TEXT_FIELD_COMMANDS: Partial<Record<EditorCommandId, 'selectAll' | 'undo' | 'redo'>> = {
  'selection.selectAll': 'selectAll',
  'edit.undo': 'undo',
  'edit.redo': 'redo'
}

const store = useEditorStore()
const COMMAND_MENU_IDS = new Set<EditorCommandId>(
  APP_MENU_SCHEMA.flatMap((group) => commandMenuIds(group.items))
)

/** Menu items besides editor commands that act on the canvas selection. */
const SELECTION_MENU_IDS = new Set([
  'paste-to-replace',
  'selection.rename',
  'text.bold',
  'text.italic',
  'text.underline',
  'arrange.align-left',
  'arrange.align-center',
  'arrange.align-right',
  'arrange.align-top',
  'arrange.align-middle',
  'arrange.align-bottom'
])

function actsOnCanvas(id: string): boolean {
  return COMMAND_MENU_IDS.has(id as EditorCommandId) || SELECTION_MENU_IDS.has(id)
}

export function useEditorMenu() {
  if (!isTauri()) return

  watchRecentFilesMenu()
  const textFieldFocused = useTextFieldFocus(store)

  const { setTheme } = useAppTheme()
  const { runCommand } = useEditorCommands()

  const actions: Partial<Record<string, () => void>> = {
    new: () => createTab(),
    open: () => void openFileDialog(),
    close: () => {
      if (activeTab.value) void closeTab(activeTab.value.id)
    },
    save: () => void store.saveFigFile(),
    'save-as': () => void store.saveFigFileAs(),
    'save-to-storage': () => void saveDocumentToStorage(store),
    'export-selection': () => {
      if (store.state.selectedIds.size > 0) void store.exportSelection(1, 'png')
    },
    'export-png': () => {
      if (store.state.selectedIds.size > 0) void store.exportSelection(1, 'png')
    },
    'export-svg': () => {
      if (store.state.selectedIds.size > 0) void store.exportSelection(1, 'svg')
    },
    'export-pptx': () => {
      if (store.state.selectedIds.size > 0) void store.exportSelection(1, 'pptx')
    },
    'export-fig': () => {
      if (store.state.selectedIds.size > 0) void store.exportSelection(1, 'fig')
    },
    autosave: () => {
      store.state.autosaveEnabled = !store.state.autosaveEnabled
    },
    ...createSelectionMenuActions(store),
    ...createSharedEditorMenuActions(setTheme)
  }

  useNativeMenuEvents((id) => {
    if (id === 'clear-recent-files') {
      void clearRecentFiles()
      return
    }
    if (id.startsWith(OPEN_RECENT_EVENT_PREFIX)) {
      const index = Number(id.slice(OPEN_RECENT_EVENT_PREFIX.length))
      const path = Number.isInteger(index) ? recentLocalFileAt(index) : null
      if (path) {
        void openFileFromPath(path).catch((error) => {
          forgetRecentFile(path)
          console.warn('[Recent files] Failed to open file', error)
        })
      }
      return
    }
    if (SHELL_MENU_IDS.has(id)) return
    // Native accelerators reach the menu when the page leaves a key unhandled, so a shortcut
    // typed in a text field must not act on the canvas, as keyboard shortcuts do not.
    if (textFieldFocused.value && actsOnCanvas(id)) return
    if (COMMAND_MENU_IDS.has(id as EditorCommandId)) {
      const fieldCommand = TEXT_FIELD_COMMANDS[id as EditorCommandId]
      if (fieldCommand && !store.state.editingTextId && isInputElement(document.activeElement)) {
        document.execCommand(fieldCommand)
        return
      }
      runCommand(id as EditorCommandId)
      return
    }
    actions[id]?.()
  })
}
