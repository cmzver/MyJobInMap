const UNITS = ['Б', 'КБ', 'МБ', 'ГБ'] as const

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })

/** Размер файла по-русски: «512 Б», «1,5 КБ», «12 МБ». Пусто/неизвестно — «—». */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—'
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  // Байты — целые; 1023,96 КБ не должно показываться как «1024 КБ»
  if (unit > 0 && Math.round(value * 10) / 10 >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${number.format(unit === 0 ? Math.round(value) : value)} ${UNITS[unit]}`
}
