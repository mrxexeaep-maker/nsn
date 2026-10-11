import { describe, expect, test } from 'bun:test'

import { describeBuildFields, describeUsageEvents } from '#feedback/contract'

describe('contract descriptions', () => {
  test('describe every usage event and property, with the values each can take', () => {
    const events = describeUsageEvents()

    expect(events.map(({ name }) => name)).toEqual([
      'app_opened',
      'document_opened',
      'document_exported',
      'ai_reply_finished'
    ])
    for (const event of events) {
      expect(event.description).not.toBe('')
      for (const property of event.properties) {
        expect(property.description).not.toBe('')
        expect(property.values.length).toBeGreaterThan(0)
      }
    }
    expect(events[1].properties).toEqual([
      {
        name: 'format',
        description: 'The file format.',
        values: expect.arrayContaining(['fig', 'pen', 'html'])
      }
    ])
  })

  test('describe the build fields every ping and batch carries', () => {
    expect(describeBuildFields().map(({ name }) => name)).toEqual([
      'version',
      'platform',
      'arch',
      'app',
      'browser'
    ])
  })
})
