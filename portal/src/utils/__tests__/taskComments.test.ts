import { describe, expect, it } from 'vitest'

import { statusChangeNote } from '../taskComments'

describe('statusChangeNote', () => {
  it('комментарий при выполнении/отмене — показываем', () => {
    expect(statusChangeNote({ old_status: 'IN_PROGRESS', new_status: 'DONE', text: ' Заменил трубку ' })).toBe(
      'Заменил трубку',
    )
  })

  it('автотекст сервера без комментария — скрываем', () => {
    expect(
      statusChangeNote({ old_status: 'NEW', new_status: 'IN_PROGRESS', text: 'Статус изменён: Новая → В работе' }),
    ).toBeNull()
  })

  it('обычный комментарий и смена исполнителя — не про статус', () => {
    expect(statusChangeNote({ text: 'Позвонить после 18:00' })).toBeNull()
    expect(statusChangeNote({ text: 'Назначение изменено: А → Б' })).toBeNull()
  })
})
