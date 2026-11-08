import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import { invalidateForTaskEvent } from '../useWebSocket'

function invalidatedKeys(type: string, data: Record<string, unknown>) {
  const qc = new QueryClient()
  const spy = vi.spyOn(qc, 'invalidateQueries')
  invalidateForTaskEvent(qc, type, data)
  return spy.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey))
}

describe('invalidateForTaskEvent', () => {
  it('смена статуса — списки, «мои», дашборд и лента комментариев заявки', () => {
    const keys = invalidatedKeys('task_status_changed', { task_id: 7 })
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(['tasks']),
        JSON.stringify(['my-tasks']),
        JSON.stringify(['analytics']),
        JSON.stringify(['comments', 'list', 7]),
      ]),
    )
  })

  it('правка заявки не дёргает дашборд', () => {
    const keys = invalidatedKeys('task_updated', { task_id: 7 })
    expect(keys).toContain(JSON.stringify(['tasks']))
    expect(keys).not.toContain(JSON.stringify(['analytics']))
  })

  it('инвалидация префикса tasks задевает карточку, карту и календарь', () => {
    const qc = new QueryClient()
    const keys = [
      ['tasks', 'detail', 7],
      ['tasks', 'map', 'NEW', '', null],
      ['tasks', 'calendar', '2026-11', null],
    ]
    keys.forEach((key) => qc.setQueryData(key, {}))
    invalidateForTaskEvent(qc, 'task_created', { task_id: 7 })
    keys.forEach((key) => expect(qc.getQueryState(key)?.isInvalidated).toBe(true))
  })
})
