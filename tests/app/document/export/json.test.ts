import { expect, test } from 'bun:test'

import { datedJSONFileName } from '@/app/document/export/json'

const day = new Date('2026-10-13T12:00:00.000Z')

test('a JSON file name keeps letters and digits of any script and the date', () => {
  expect(datedJSONFileName('Add a queue screen trace', day)).toBe(
    'add-a-queue-screen-trace-2026-10-13.json'
  )
  expect(datedJSONFileName('Экран «Очередь» / v2', day)).toBe('экран-очередь-v2-2026-10-13.json')
})

test('a JSON file name drops path separators and falls back when nothing is left', () => {
  expect(datedJSONFileName('../../etc/passwd', day)).toBe('etc-passwd-2026-10-13.json')
  expect(datedJSONFileName('…', day)).toBe('openpencil-2026-10-13.json')
})
