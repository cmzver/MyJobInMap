import { describe, expect, it } from 'vitest'
import { countRu, pluralRu } from '../plural'

describe('pluralRu', () => {
  const forms = ['заявка', 'заявки', 'заявок'] as const

  it.each([
    [0, 'заявок'], [1, 'заявка'], [2, 'заявки'], [4, 'заявки'], [5, 'заявок'],
    [11, 'заявок'], [12, 'заявок'], [14, 'заявок'], [21, 'заявка'], [22, 'заявки'],
    [111, 'заявок'], [101, 'заявка'], [1000, 'заявок'],
  ])('%i → %s', (count, expected) => {
    expect(pluralRu(count, ...forms)).toBe(expected)
  })

  it('countRu ставит число перед словом', () => {
    expect(countRu(3, ...forms)).toBe('3 заявки')
  })
})
