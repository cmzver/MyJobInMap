// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { tasksApi } from '@/api/tasks'
import type { Task } from '@/types/task'
import { commentKeys } from '../useComments'
import { useAssignTask, useUpdateTaskStatus } from '../useTasks'

const task = { id: 7, status: 'IN_PROGRESS', assigned_user_id: 3 } as unknown as Task

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Лента комментариев уже загружена — история заявки строится из неё
  client.setQueryData(commentKeys.list(7), [])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('мутации заявки обновляют историю (комментарии)', () => {
  it('смена статуса', async () => {
    vi.spyOn(tasksApi, 'updateTaskStatus').mockResolvedValue(task)
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useUpdateTaskStatus(), { wrapper })

    await act(() => result.current.mutateAsync({ id: 7, status: 'IN_PROGRESS' }))
    await waitFor(() => expect(client.getQueryState(commentKeys.list(7))?.isInvalidated).toBe(true))
  })

  it('смена исполнителя', async () => {
    vi.spyOn(tasksApi, 'assignTask').mockResolvedValue(task)
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useAssignTask(), { wrapper })

    await act(() => result.current.mutateAsync({ id: 7, assignedUserId: 3 }))
    expect(client.getQueryState(commentKeys.list(7))?.isInvalidated).toBe(true)
  })
})
