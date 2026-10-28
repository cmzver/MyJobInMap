import { describe, expect, it } from 'vitest'

import {
  defaultVisibleTaskTableColumns,
  getTaskTableColumnWidthCssVar,
  getVisibleTaskTableColumnOrder,
  toggleableTaskTableColumns,
} from '@/components/tasks/taskTableConfig'

describe('taskTableConfig', () => {
  it('keeps the selection column first and preserves configured column order', () => {
    expect(getVisibleTaskTableColumnOrder(defaultVisibleTaskTableColumns)).toEqual([
      'select',
      ...toggleableTaskTableColumns.map(({ key }) => key),
    ])
  })

  it('omits hidden columns without removing the selection column', () => {
    expect(
      getVisibleTaskTableColumnOrder({
        ...defaultVisibleTaskTableColumns,
        address: false,
        creator: false,
      })
    ).not.toContain('address')
    expect(
      getVisibleTaskTableColumnOrder({
        ...defaultVisibleTaskTableColumns,
        address: false,
        creator: false,
      })
    ).toEqual(expect.arrayContaining(['select', 'number', 'title']))
  })

  it('uses stable CSS variables for persisted column widths', () => {
    expect(getTaskTableColumnWidthCssVar('assignee')).toBe('--tasks-col-assignee')
  })
})
