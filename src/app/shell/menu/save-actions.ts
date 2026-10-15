import { openSaveTo } from '@/app/cloud/documents/save'
import type { EditorStore } from '@/app/editor/active-store'

export function createSaveMenuActions(store: EditorStore) {
  return {
    save: () => void store.saveFigFile(),
    'save-as': () => void store.saveFigFileAs(),
    'save-to': () => void openSaveTo(store)
  }
}
