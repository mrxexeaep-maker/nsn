import { expect, test } from 'bun:test'

import { SceneGraph } from '@open-pencil/scene-graph'

import { createEditorStore } from '@/app/editor/session'

test('renaming marks the document dirty, while unchanged and read-only titles do not', () => {
  const store = createEditorStore(new SceneGraph())
  try {
    store.markDocumentSaved()
    store.renameDocument(store.state.documentName)
    expect(store.hasUnsavedChanges()).toBe(false)
    store.renameDocument('Checkout')
    expect(store.state.documentName).toBe('Checkout')
    expect(store.hasUnsavedChanges()).toBe(true)
    store.markDocumentSaved()
    store.setReadOnly(true)
    store.renameDocument('Other')
    expect(store.state.documentName).toBe('Checkout')
    expect(store.hasUnsavedChanges()).toBe(false)
  } finally {
    store.dispose()
  }
})
