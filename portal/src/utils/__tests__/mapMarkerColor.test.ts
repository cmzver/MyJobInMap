import { describe, expect, it } from 'vitest'

import { STATUS_HEX } from '@/config/taskConstants'
import { EMERGENCY_MARKER_HEX, getDominantStatus, getMarkerColor, hasOpenEmergency } from '@/utils/mapMarkerColor'

describe('mapMarkerColor', () => {
  it('одна заявка — цвет её статуса', () => {
    expect(getMarkerColor([{ status: 'NEW', priority: 'CURRENT' }])).toBe(STATUS_HEX.NEW)
    expect(getMarkerColor([{ status: 'IN_PROGRESS', priority: 'URGENT' }])).toBe(STATUS_HEX.IN_PROGRESS)
    expect(getMarkerColor([{ status: 'DONE', priority: 'PLANNED' }])).toBe(STATUS_HEX.DONE)
    expect(getMarkerColor([{ status: 'CANCELLED' }])).toBe(STATUS_HEX.CANCELLED)
  })

  it('новые важнее «в работе», те — закрытых', () => {
    expect(getDominantStatus([{ status: 'DONE' }, { status: 'IN_PROGRESS' }, { status: 'NEW' }])).toBe('NEW')
    expect(getDominantStatus([{ status: 'CANCELLED' }, { status: 'IN_PROGRESS' }])).toBe('IN_PROGRESS')
    expect(getDominantStatus([{ status: 'CANCELLED' }, { status: 'DONE' }])).toBe('DONE')
  })

  it('открытая аварийная — красный, закрытая аварийная — нет', () => {
    expect(getMarkerColor([{ status: 'DONE' }, { status: 'IN_PROGRESS', priority: 'EMERGENCY' }])).toBe(
      EMERGENCY_MARKER_HEX,
    )
    expect(getMarkerColor([{ status: 'NEW', priority: 4 }])).toBe(EMERGENCY_MARKER_HEX)
    expect(hasOpenEmergency([{ status: 'DONE', priority: 'EMERGENCY' }])).toBe(false)
    expect(getMarkerColor([{ status: 'DONE', priority: 'EMERGENCY' }])).toBe(STATUS_HEX.DONE)
  })

  it('красный аварийной не совпадает ни с одним цветом статуса', () => {
    expect(Object.values(STATUS_HEX)).not.toContain(EMERGENCY_MARKER_HEX)
  })
})
