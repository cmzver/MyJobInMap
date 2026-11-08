import { describe, expect, it } from 'vitest'
import { formatFileSize } from '../fileSize'

describe('formatFileSize', () => {
  it('formats with Russian units and decimal comma', () => {
    expect(formatFileSize(0)).toBe('0 Б')
    expect(formatFileSize(512)).toBe('512 Б')
    expect(formatFileSize(1536)).toBe('1,5 КБ')
    expect(formatFileSize(12 * 1024 * 1024)).toBe('12 МБ')
    expect(formatFileSize(3.25 * 1024 ** 3)).toBe('3,3 ГБ')
  })

  it('does not show 1024 of the smaller unit', () => {
    expect(formatFileSize(1024 * 1024 - 1)).toBe('1 МБ')
  })

  it('shows a dash for unknown sizes', () => {
    expect(formatFileSize(null)).toBe('—')
    expect(formatFileSize(undefined)).toBe('—')
    expect(formatFileSize(Number.NaN)).toBe('—')
  })
})
