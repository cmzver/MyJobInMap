export interface BulkResult {
  successCount: number
  failedCount: number
  /** Заявки, где действие прошло — их и снимаем с выделения */
  succeededIds: number[]
  /** Первая ошибка — для текста тоста */
  firstError: unknown
}

/**
 * Массовое действие по одной заявке за запрос. Promise.all обрывался на
 * первой ошибке, хотя остальные запросы уже прошли: список не обновлялся,
 * а пользователь видел «ошибку» при частично применённом изменении.
 */
export async function settleEach(ids: number[], action: (id: number) => Promise<unknown>): Promise<BulkResult> {
  const results = await Promise.allSettled(ids.map((id) => action(id)))
  const succeededIds: number[] = []
  let firstError: unknown = null
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') succeededIds.push(ids[index]!)
    else if (firstError === null) firstError = result.reason
  })
  return {
    successCount: succeededIds.length,
    failedCount: ids.length - succeededIds.length,
    succeededIds,
    firstError,
  }
}
