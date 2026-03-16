/**
 * Tests for dateFormat utilities.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  formatDateTime,
  formatDateOnly,
  formatDatePretty,
  formatDateRelative,
  formatWeekday,
  formatDateShort,
  getSla,
} from '../dateFormat'

// ========================================================================
// formatDateTime
// ========================================================================
describe('formatDateTime', () => {
  it('formats ISO string to dd.MM.yyyy HH:mm', () => {
    // 2026-01-25T14:30:00 → '25.01.2026 14:30'
    const result = formatDateTime('2026-01-25T14:30:00')
    expect(result).toBe('25.01.2026 14:30')
  })

  it('returns dash for null', () => {
    expect(formatDateTime(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatDateTime(undefined)).toBe('—')
  })

  it('returns dash for empty string', () => {
    expect(formatDateTime('')).toBe('—')
  })

  it('returns original string for invalid date', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
  })
})

// ========================================================================
// formatDateOnly
// ========================================================================
describe('formatDateOnly', () => {
  it('formats ISO string to dd.MM.yyyy', () => {
    expect(formatDateOnly('2026-03-15T09:00:00')).toBe('15.03.2026')
  })

  it('returns dash for null', () => {
    expect(formatDateOnly(null)).toBe('—')
  })

  it('returns original for invalid date', () => {
    expect(formatDateOnly('bad')).toBe('bad')
  })
})

// ========================================================================
// formatDatePretty
// ========================================================================
describe('formatDatePretty', () => {
  it('formats to pretty format with locale', () => {
    const result = formatDatePretty('2026-01-25T14:30:00')
    // date-fns ru locale: '25 янв. 2026, 14:30' or '25 янв 2026, 14:30'
    expect(result).toMatch(/25.*янв.*2026.*14:30/)
  })

  it('returns dash for null', () => {
    expect(formatDatePretty(null)).toBe('—')
  })
})

// ========================================================================
// formatDateRelative
// ========================================================================
describe('formatDateRelative', () => {
  it('returns string with "назад" for past dates', () => {
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString()
    const result = formatDateRelative(pastDate)
    expect(result).toContain('назад')
  })

  it('returns dash for null', () => {
    expect(formatDateRelative(null)).toBe('—')
  })

  it('returns original for invalid date', () => {
    expect(formatDateRelative('xyz')).toBe('xyz')
  })
})

// ========================================================================
// formatWeekday
// ========================================================================
describe('formatWeekday', () => {
  it('returns short weekday name in Russian', () => {
    // 2026-01-26 is Monday
    const result = formatWeekday('2026-01-26')
    // date-fns ru: 'пн' or 'пн.'
    expect(result.toLowerCase()).toMatch(/пн/)
  })

  it('returns original for invalid date', () => {
    expect(formatWeekday('bad')).toBe('bad')
  })
})

// ========================================================================
// formatDateShort
// ========================================================================
describe('formatDateShort', () => {
  it('formats to short date', () => {
    const result = formatDateShort('2026-01-25')
    // '25 янв' or '25 янв.'
    expect(result).toMatch(/25.*янв/)
  })

  it('returns dash for null', () => {
    expect(formatDateShort(null)).toBe('—')
  })
})

// ========================================================================
// getSla
// ========================================================================
describe('getSla', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Нет срока" when no planned date', () => {
    const result = getSla(null)
    expect(result.label).toBe('Нет срока')
    expect(result.tone).toContain('gray')
  })

  it('returns "Нет срока" when undefined', () => {
    const result = getSla(undefined)
    expect(result.label).toBe('Нет срока')
  })

  it('returns "Закрыта" for DONE status', () => {
    const result = getSla('2026-12-31', 'DONE')
    expect(result.label).toBe('Закрыта')
    expect(result.tone).toContain('gray')
  })

  it('returns "Закрыта" for CANCELLED status', () => {
    const result = getSla('2026-12-31', 'CANCELLED')
    expect(result.label).toBe('Закрыта')
  })

  it('returns "Осталось" for future deadline', () => {
    // Set time far before deadline
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00'))

    const result = getSla('2026-01-10T00:00:00', 'NEW')
    expect(result.label).toContain('Осталось')
    expect(result.tone).toContain('green')
  })

  it('returns "Просрочено" for past deadline', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T00:00:00'))

    const result = getSla('2026-01-01T00:00:00', 'IN_PROGRESS')
    expect(result.label).toContain('Просрочено')
    expect(result.tone).toContain('red')
  })

  it('returns amber tone when ≤24h remaining', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10T12:00:00'))

    const result = getSla('2026-01-11T00:00:00', 'NEW')
    expect(result.label).toContain('Осталось')
    expect(result.tone).toContain('amber')
  })

  it('formats days and hours correctly', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00'))

    const result = getSla('2026-01-03T12:00:00', 'NEW')
    // 2 days 12 hours
    expect(result.label).toContain('2д')
    expect(result.label).toContain('12ч')
  })

  it('omits days when <24h', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T18:00:00'))

    const result = getSla('2026-01-02T00:00:00', 'NEW')
    // 6 hours left
    expect(result.label).toMatch(/Осталось\s+6ч/)
  })
})
