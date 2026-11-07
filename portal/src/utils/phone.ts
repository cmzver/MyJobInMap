/**
 * Телефон к одному виду: «+7 921 987-65-43» (как в приложении).
 *
 * Принимает «89219876543», «8 (921) 987 65 43», «9219876543», «+7-921-…».
 * Нераспознанное (городской короткий, иностранный) возвращает как есть —
 * лучше сохранить номер, чем испортить. SMS заявителю уходит только на
 * мобильный в формате 7 9XX…, поэтому единый вид важен.
 */
export function normalizePhone(raw: string): string {
  const text = raw.trim()
  if (!text) return ''
  let digits = text.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('9')) digits = `7${digits}`
  if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
    digits = `7${digits.slice(1)}`
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
  }
  return text
}
