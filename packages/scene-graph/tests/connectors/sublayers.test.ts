import { describe, expect, test } from 'bun:test'

import {
  connectorDash,
  connectorLineStyle,
  connectorLineStyleFields,
  connectorStroke
} from '@open-pencil/scene-graph'

describe('connector line style', () => {
  test("FigJam's dash is longer for a thick line", () => {
    expect(connectorDash(4)).toEqual([16, 10])
    expect(connectorDash(8)).toEqual([40, 24])
  })

  test('a restyle keeps what it leaves out and reads back as set', () => {
    const line = { strokes: [connectorStroke()] }
    const thick = { ...line, ...connectorLineStyleFields(line, { weight: 8, dashed: true }) }
    expect(connectorLineStyle(thick)).toMatchObject({ weight: 8, dashed: true })
    expect(thick.strokes[0]).toMatchObject({ cap: 'ROUND', join: 'ROUND' })
    const solid = connectorLineStyleFields(thick, { dashed: false })
    expect(solid).toMatchObject({ strokeWeight: 8, dashPattern: [] })
  })
})
