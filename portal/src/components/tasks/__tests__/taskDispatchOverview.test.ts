import { describe, expect, it } from 'vitest'
import type { Task } from '@/types/task'
import { buildTaskDispatchOverview } from '../taskDispatchOverviewModel'

const task = (overrides: Partial<Task>): Task =>
  ({
    id: 1,
    title: 'Заявка',
    raw_address: 'Адрес',
    description: '',
    lat: 0,
    lon: 0,
    status: 'NEW',
    priority: 'CURRENT',
    created_at: '2026-10-29T10:00:00Z',
    updated_at: '2026-10-29T10:00:00Z',
    is_remote: false,
    is_paid: false,
    payment_amount: 0,
    comments_count: 0,
    ...overrides,
  }) as Task

describe('buildTaskDispatchOverview', () => {
  it('groups tasks by assignee and counts statuses', () => {
    const rows = buildTaskDispatchOverview([
      task({ id: 1, assigned_user_id: 7, assigned_user_name: 'Анна', status: 'NEW' }),
      task({ id: 2, assigned_user_id: 7, assigned_user_name: 'Анна', status: 'DONE' }),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      assigneeId: 7,
      assigneeName: 'Анна',
      active: 1,
      urgent: 0,
      total: 2,
      counts: { NEW: 1, IN_PROGRESS: 0, DONE: 1, CANCELLED: 0 },
    })
  })

  it('puts unassigned tasks first and counts urgent active work only', () => {
    const rows = buildTaskDispatchOverview([
      task({
        id: 1,
        assigned_user_id: 4,
        assigned_user_name: 'Борис',
        status: 'IN_PROGRESS',
        priority: 'URGENT',
      }),
      task({ id: 2, status: 'NEW', priority: 'EMERGENCY' }),
      task({
        id: 3,
        assigned_user_id: 4,
        assigned_user_name: 'Борис',
        status: 'DONE',
        priority: 'EMERGENCY',
      }),
    ])

    expect(rows.map((row) => row.key)).toEqual(['unassigned', '4'])
    expect(rows[0]).toMatchObject({ assigneeId: null, active: 1, urgent: 1 })
    expect(rows[1]).toMatchObject({ assigneeId: 4, active: 1, urgent: 1, total: 2 })
  })

  it('orders assigned users by active workload', () => {
    const rows = buildTaskDispatchOverview([
      task({ id: 1, assigned_user_id: 1, assigned_user_name: 'Анна', status: 'DONE' }),
      task({ id: 2, assigned_user_id: 2, assigned_user_name: 'Борис', status: 'NEW' }),
      task({ id: 3, assigned_user_id: 2, assigned_user_name: 'Борис', status: 'IN_PROGRESS' }),
    ])

    expect(rows.map((row) => row.assigneeName)).toEqual(['Борис', 'Анна'])
  })
})
