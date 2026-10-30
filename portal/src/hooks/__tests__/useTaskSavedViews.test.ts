import { describe, expect, it } from 'vitest'
import {
  areTaskViewSettingsEqual,
  parseTaskSavedViews,
  type TaskSavedViewSettings,
} from '../useTaskSavedViews'

const settings: TaskSavedViewSettings = {
  search: 'насос',
  statuses: ['NEW'],
  priorities: ['URGENT', 'EMERGENCY'],
  assignees: ['3'],
  addressId: '12',
  addressTitle: 'Ленина, 1',
  sort: 'created_at_desc',
  groupBy: 'status',
  displayMode: 'dispatch',
}

describe('task saved views', () => {
  it('returns an empty list for broken storage data', () => {
    expect(parseTaskSavedViews('{broken')).toEqual([])
    expect(parseTaskSavedViews('{}')).toEqual([])
  })

  it('sanitizes saved settings loaded from storage', () => {
    const result = parseTaskSavedViews(
      JSON.stringify([
        {
          id: 'urgent',
          name: ' Срочные ',
          settings: {
            search: 42,
            statuses: ['NEW', 'UNKNOWN'],
            priorities: ['URGENT'],
            assignees: ['3', 'invalid'],
            addressId: 'invalid',
            addressTitle: 'Ленина, 1',
            sort: 'invalid',
            groupBy: 'invalid',
            displayMode: 'invalid',
          },
        },
      ])
    )

    expect(result).toEqual([
      {
        id: 'urgent',
        name: 'Срочные',
        settings: {
          search: '',
          statuses: ['NEW'],
          priorities: ['URGENT'],
          assignees: ['3'],
          addressId: '',
          addressTitle: 'Ленина, 1',
          sort: 'created_at_desc',
          groupBy: '',
          displayMode: 'list',
        },
      },
    ])
  })

  it('compares array filters without depending on their order', () => {
    expect(
      areTaskViewSettingsEqual(settings, {
        ...settings,
        priorities: ['EMERGENCY', 'URGENT'],
      })
    ).toBe(true)
    expect(
      areTaskViewSettingsEqual(settings, {
        ...settings,
        groupBy: 'priority',
      })
    ).toBe(false)
    expect(
      areTaskViewSettingsEqual(settings, {
        ...settings,
        displayMode: 'list',
      })
    ).toBe(false)
  })
})
