import { describe, expect, it } from 'vitest'

import { settleEach } from '../bulk'

describe('settleEach', () => {
  it('частичный сбой не обрывает остальные и считает итог', async () => {
    const seen: number[] = []
    const failure = new Error('Недостаточно прав')
    const result = await settleEach([1, 2, 3], async (id) => {
      seen.push(id)
      if (id === 2) throw failure
    })

    expect(seen).toEqual([1, 2, 3])
    expect(result).toEqual({ successCount: 2, failedCount: 1, succeededIds: [1, 3], firstError: failure })
  })

  it('всё прошло — без ошибки', async () => {
    const result = await settleEach([5], async () => undefined)
    expect(result.failedCount).toBe(0)
    expect(result.firstError).toBeNull()
  })
})
