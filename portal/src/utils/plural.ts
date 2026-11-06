/**
 * Форма слова для числа: pluralRu(1, 'заявка', 'заявки', 'заявок') → 'заявка',
 * 2 → 'заявки', 5 и 11–14 → 'заявок', 21 → 'заявка'.
 */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(Math.trunc(count))
  const lastTwo = n % 100
  const last = n % 10
  if (lastTwo >= 11 && lastTwo <= 14) return many
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

/** «5 заявок» — число и согласованное слово. */
export function countRu(count: number, one: string, few: string, many: string): string {
  return `${count} ${pluralRu(count, one, few, many)}`
}
