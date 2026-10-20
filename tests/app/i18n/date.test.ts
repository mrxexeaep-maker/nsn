import { describe, expect, test } from 'bun:test'

import { formatDate, formatRelativeTime, formatTimeOrDay } from '@/app/i18n/date'

const NOW = Date.parse('2026-10-09T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('relative times', () => {
  test('read as how long ago, in the given language', () => {
    expect(formatRelativeTime(ago(10_000), NOW, 'en')).toBe('now')
    expect(formatRelativeTime(ago(5 * 60_000), NOW, 'en')).toBe('5 min. ago')
    expect(formatRelativeTime(ago(3 * 3_600_000), NOW, 'en')).toBe('3 hr. ago')
    expect(formatRelativeTime(ago(24 * 3_600_000), NOW, 'en')).toBe('yesterday')
    expect(formatRelativeTime(ago(5 * 60_000), NOW, 'de')).toBe('vor 5 Min.')
  })

  test('turn into a short date after a week, and show nothing for a bad date', () => {
    expect(formatRelativeTime('2026-09-01T12:00:00.000Z', NOW, 'en')).toBe('Sep 1')
    expect(formatRelativeTime('not a date', NOW, 'en')).toBe('')
  })
})

describe('dates', () => {
  test('follow the language they are given, not the browser’s', () => {
    expect(formatDate('2026-10-19T12:00:00.000Z', 'date', 'en')).toBe('Oct 19, 2026')
    expect(formatDate('2026-10-19T12:00:00.000Z', 'date', 'de')).toBe('19.10.2026')
  })

  test('show nothing for a missing or bad date', () => {
    expect(formatDate(null, 'dateTime', 'en')).toBe('')
    expect(formatDate('', 'day', 'en')).toBe('')
    expect(formatDate('not a date', 'day', 'en')).toBe('')
  })

  test('give the time for today and the day as well before, as autosaves read', () => {
    const today = new Date(NOW - 3_600_000)
    const earlier = new Date(NOW - 3 * 24 * 3_600_000)
    expect(formatTimeOrDay(today, NOW, 'en')).toBe(formatDate(today, 'time', 'en'))
    expect(formatTimeOrDay(earlier, NOW, 'en')).toBe(formatDate(earlier, 'dayTime', 'en'))
  })
})
