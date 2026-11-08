interface StatusChangeComment {
  text?: string | null
  old_status?: string | null
  new_status?: string | null
}

// Текст, который сервер пишет сам, когда к смене статуса нет комментария
const AUTO_STATUS_TEXT = /^Статус изменён:/

/**
 * Комментарий человека при смене статуса: «что сделано» при выполнении,
 * причина отмены. Сервер кладёт его в text того же системного комментария;
 * без комментария там автотекст «Статус изменён: …» — его не показываем.
 */
export function statusChangeNote(comment: StatusChangeComment): string | null {
  if (!comment.old_status && !comment.new_status) return null
  const text = comment.text?.trim()
  if (!text || AUTO_STATUS_TEXT.test(text)) return null
  return text
}
