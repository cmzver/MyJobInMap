import { describe, expect, it } from 'vitest'
import { houseFromAddress, isSameHouse, splitUnitParts, streetKey } from '../addressMatch'

describe('streetKey', () => {
  it('drops the street type wherever it stands', () => {
    expect(streetKey('Ленина ул.')).toBe('ленина')
    expect(streetKey('ул. Ленина')).toBe('ленина')
    expect(streetKey('Невский пр.')).toBe('невский')
  })
})

describe('houseFromAddress', () => {
  it('reads building and corpus, ignoring the flat', () => {
    expect(houseFromAddress('ул. Ленина, 10, кв. 5')).toEqual({ building: '10', corpus: '' })
    expect(houseFromAddress('Ленинский пр., д. 82, корп. 3, СПб')).toEqual({ building: '82', corpus: '3' })
    expect(houseFromAddress('Московский проспект 200А')).toEqual({ building: '200а', corpus: '' })
  })
})

describe('isSameHouse', () => {
  const target = { street: 'Ленина ул.', building: '10', corpus: '' }

  it('matches an old record whose parts were never parsed', () => {
    expect(isSameHouse({ address: 'ул. Ленина, 10, кв. 5' }, target)).toBe(true)
  })

  it('matches by parsed parts', () => {
    expect(isSameHouse({ address: 'x', street: 'ул. Ленина', building: '10', corpus: '' }, target)).toBe(true)
  })

  it('does not match another house or corpus on the same street', () => {
    expect(isSameHouse({ address: 'ул. Ленина, 12' }, target)).toBe(false)
    expect(isSameHouse({ address: 'ул. Ленина, д. 10, корп. 2' }, target)).toBe(false)
  })
})

describe('splitUnitParts', () => {
  it('takes entrance and apartment out of a dictated address', () => {
    expect(splitUnitParts('ветеранов 46 под 2 кв 15')).toEqual({
      query: 'ветеранов 46',
      entrance: '2',
      apartment: '15',
    })
    expect(splitUnitParts('СПб, Невский пр., д. 1, парадная 3, кв. 7а')).toEqual({
      query: 'СПб, Невский пр., д. 1',
      entrance: '3',
      apartment: '7а',
    })
  })

  it('leaves a plain address and street names like «Подъездной» alone', () => {
    expect(splitUnitParts('Подъездной пер., 5')).toEqual({
      query: 'Подъездной пер., 5',
      entrance: '',
      apartment: '',
    })
  })
})
