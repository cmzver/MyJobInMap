import { describe, expect, it } from 'vitest'

import { shouldRetryQuery } from '@/utils/queryRetry'

const withStatus = (status: number) => ({ response: { status } })

describe('shouldRetryQuery', () => {
  it('не повторяет ответы 4xx', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(shouldRetryQuery(0, withStatus(status))).toBe(false)
    }
  })

  it('повторяет один раз сбои сети и сервера', () => {
    expect(shouldRetryQuery(0, new Error('Network Error'))).toBe(true)
    expect(shouldRetryQuery(0, withStatus(502))).toBe(true)
    expect(shouldRetryQuery(0, withStatus(429))).toBe(true)
    expect(shouldRetryQuery(1, withStatus(502))).toBe(false)
  })
})
