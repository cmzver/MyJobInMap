import { describe, expect, it } from 'vitest'

import { formatHours } from '../analyticsUtils'

describe('formatHours', () => {
  it('дробные часы — с запятой, как принято по-русски', () => {
    expect(formatHours(2.5)).toBe('2,5ч')
    expect(formatHours(3)).toBe('3ч')
  })

  it('минуты и дни', () => {
    expect(formatHours(0.5)).toBe('30м')
    expect(formatHours(50)).toBe('2д 2ч')
  })
})
