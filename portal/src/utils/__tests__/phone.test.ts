import { describe, expect, it } from 'vitest'
import { normalizePhone } from '../phone'

describe('normalizePhone', () => {
  it('brings Russian numbers to one format', () => {
    expect(normalizePhone('89219876543')).toBe('+7 921 987-65-43')
    expect(normalizePhone('8 (921) 987 65 43')).toBe('+7 921 987-65-43')
    expect(normalizePhone('+7-921-987-65-43')).toBe('+7 921 987-65-43')
    expect(normalizePhone('9219876543')).toBe('+7 921 987-65-43')
  })

  it('keeps what it cannot recognise', () => {
    expect(normalizePhone(' 123-45 ')).toBe('123-45')
    expect(normalizePhone('+44 20 7946 0958')).toBe('+44 20 7946 0958')
    expect(normalizePhone('')).toBe('')
  })
})
