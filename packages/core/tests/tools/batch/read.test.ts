import { expect, test } from 'bun:test'

import * as v from 'valibot'

import { createEditor } from '#core/editor'
import { FigmaAPI } from '#core/figma-api'
import { MAX_BATCH_READ_LENGTH } from '#core/tools/batch/read'
import { getNode } from '#core/tools/read/nodes'
import { nodeBounds } from '#core/tools/structure/basic'

test('bulk inspection labels successes and failures and defaults to shallow node reads', () => {
  const editor = createEditor()
  const figma = new FigmaAPI(editor.graph)
  const frame = figma.createFrame()
  const text = figma.createText()
  frame.appendChild(text)
  try {
    const result = v.parse(
      v.object({
        results: v.array(
          v.object({
            id: v.string(),
            result: v.optional(v.record(v.string(), v.unknown())),
            error: v.optional(v.string())
          })
        )
      }),
      getNode.execute(figma, { ids: [frame.id, 'missing', text.id] })
    )
    expect(result.results.map((entry) => entry.id)).toEqual([frame.id, 'missing', text.id])
    expect(result.results[0].result?.children).toBeUndefined()
    expect(result.results[1].error).toContain('not found')
    expect(result.results[2].result).toMatchObject({ id: text.id, type: 'TEXT' })
    expect(getNode.execute(figma, { items: [{ id: frame.id, depth: 1 }] })).toMatchObject({
      results: [{ result: { children: [{ id: text.id }] } }]
    })
    expect(getNode.execute(figma, { id: frame.id })).toMatchObject({ children: [{ id: text.id }] })
    expect(nodeBounds.execute(figma, { ids: [frame.id, text.id] })).toMatchObject({
      results: [{ id: frame.id }, { id: text.id }]
    })
  } finally {
    editor.dispose()
  }
})

test('oversized inspection entries produce actionable errors without flooding the response', () => {
  const editor = createEditor()
  const figma = new FigmaAPI(editor.graph)
  const huge = figma.createText()
  huge.characters = 'a'.repeat(MAX_BATCH_READ_LENGTH)
  const small = figma.createFrame()
  try {
    const result = getNode.execute(figma, { ids: [huge.id, small.id] })
    expect(JSON.stringify(result).length).toBeLessThan(MAX_BATCH_READ_LENGTH + 100)
    expect(result).toMatchObject({
      results: [
        { id: huge.id, error: expect.stringContaining('separately') },
        { id: small.id, result: { id: small.id } }
      ],
      omitted: 0
    })
  } finally {
    editor.dispose()
  }
})
