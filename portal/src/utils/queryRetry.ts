/**
 * Повтор запроса React Query: только там, где повтор может помочь.
 *
 * 4xx (нет доступа, не найдено, ошибка валидации) повтором не исправить —
 * лишний запрос лишь откладывает показ ошибки. Повторяем сетевые сбои
 * (нет ответа), таймаут, «слишком много запросов» и ошибки сервера.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false
  const status = (error as { response?: { status?: number } } | null)?.response?.status
  if (status === undefined) return true
  return status === 408 || status === 429 || status >= 500
}
