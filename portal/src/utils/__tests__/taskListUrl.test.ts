import { describe, expect, it } from 'vitest'

import { buildTaskListUrl } from '@/utils/taskListUrl'

describe('buildTaskListUrl', () => {
  it('returns the pathname when there are no filters', () => {
    expect(buildTaskListUrl()).toBe('/tasks')
    expect(buildTaskListUrl({}, '/my-tasks')).toBe('/my-tasks')
  })

  it('builds repeated task filters understood by TasksPage', () => {
    expect(buildTaskListUrl({
      statuses: ['NEW', 'IN_PROGRESS'],
      priorities: ['EMERGENCY', 'URGENT'],
      assigneeIds: [7, 9],
    })).toBe('/tasks?status=NEW&status=IN_PROGRESS&priority=EMERGENCY&priority=URGENT&assignee=7&assignee=9')
  })

  it('removes duplicates and invalid assignee identifiers', () => {
    expect(buildTaskListUrl({
      statuses: ['NEW', 'NEW'],
      assigneeIds: [4, 4, 0, -2, 1.5],
    })).toBe('/tasks?status=NEW&assignee=4')
  })

  it('keeps optional view settings and trims user text', () => {
    expect(buildTaskListUrl({
      search: '  авария  ',
      addressId: 12,
      addressTitle: '  Ленина, 5  ',
      sort: 'created_at_asc',
      groupBy: 'priority',
    })).toBe('/tasks?search=%D0%B0%D0%B2%D0%B0%D1%80%D0%B8%D1%8F&address_id=12&address_title=%D0%9B%D0%B5%D0%BD%D0%B8%D0%BD%D0%B0%2C+5&sort=created_at_asc&group=priority')
  })

  it('does not emit a title without a valid address', () => {
    expect(buildTaskListUrl({ addressTitle: 'Ленина, 5' })).toBe('/tasks')
  })
})
