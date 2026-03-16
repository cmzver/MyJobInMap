/**
 * Tests for cn() utility (tailwind-merge wrapper).
 */

import { describe, it, expect } from 'vitest'
import { cn } from '../cn'

describe('cn', () => {
  it('merges simple classes', () => {
    expect(cn('p-4', 'mt-2')).toBe('p-4 mt-2')
  })

  it('resolves conflicting Tailwind classes', () => {
    // tailwind-merge keeps last: p-6 wins over p-4
    expect(cn('p-4', 'p-6')).toBe('p-6')
  })

  it('filters out falsy values', () => {
    expect(cn('text-sm', false, null, undefined, 'font-bold')).toBe('text-sm font-bold')
  })

  it('returns empty string for no args', () => {
    expect(cn()).toBe('')
  })

  it('handles single class', () => {
    expect(cn('bg-red-500')).toBe('bg-red-500')
  })

  it('handles conditional classes pattern', () => {
    const isActive = true
    const isDisabled = false
    const result = cn(
      'base-class',
      isActive && 'active-class',
      isDisabled && 'disabled-class',
    )
    expect(result).toBe('base-class active-class')
  })

  it('merges color conflicts', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })
})
