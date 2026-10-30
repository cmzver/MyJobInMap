import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
vi.mock('@/api/client', () => ({ default: { get: (...args: unknown[]) => get(...args) } }))

import { MAX_TASKS_PAGE_SIZE, fetchAllTaskPages } from '@/api/tasks'

const page = (ids: number[], pages: number) => ({
  data: { items: ids.map((id) => ({ id })), pages },
})

describe('fetchAllTaskPages', () => {
  beforeEach(() => get.mockReset())

  it('never asks the server for more than its page limit', async () => {
    get.mockResolvedValueOnce(page([1], 1))

    await fetchAllTaskPages(new URLSearchParams({ size: '200', status: 'NEW' }))

    const query = new URLSearchParams(String(get.mock.calls[0]?.[0]).split('?')[1])
    expect(query.get('size')).toBe(String(MAX_TASKS_PAGE_SIZE))
    expect(query.get('status')).toBe('NEW')
  })

  it('collects every page in order', async () => {
    get
      .mockResolvedValueOnce(page([1, 2], 3))
      .mockResolvedValueOnce(page([3, 4], 3))
      .mockResolvedValueOnce(page([5], 3))

    const tasks = await fetchAllTaskPages(new URLSearchParams())

    expect(tasks.map((task) => task.id)).toEqual([1, 2, 3, 4, 5])
    const pages = get.mock.calls.map(([url]) => new URLSearchParams(String(url).split('?')[1]).get('page'))
    expect(pages).toEqual(['1', '2', '3'])
  })
})
