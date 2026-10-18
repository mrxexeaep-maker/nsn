import { expect, test } from 'bun:test'

import { readFixtureArrayBuffer } from '#fig-tests/helpers/fig-fixtures'

import { createFigDocumentSession } from '@open-pencil/fig'
import type { SceneGraph } from '@open-pencil/scene-graph'

/**
 * Reads a page and keeps only the graph, with a weak handle on the reader's page list, which
 * only the reader holds once the session is dropped.
 */
function readGraph(): { graph: SceneGraph; readerPages: WeakRef<object> } {
  const session = createFigDocumentSession(readFixtureArrayBuffer('gold-preview.fig'))
  session.loadPage(session.pages[0].id)
  return { graph: session.graph, readerPages: new WeakRef(session.pages) }
}

/**
 * A design kit's records and the archive behind them take gigabytes, which the editor frees once
 * every page is loaded. The graph lives on, so nothing it holds may keep the reader: its id
 * generator once did, through the scope its closure shared with the reader.
 */
test('a read graph does not keep the archive reader alive', async () => {
  const { graph, readerPages } = readGraph()
  // A weak reference keeps its target until the job that made it ends.
  await Bun.sleep(0)
  Bun.gc(true)
  expect(graph.getPages().length).toBeGreaterThan(0)
  expect(readerPages.deref()).toBeUndefined()
})
