export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}м`
  if (hours < 24) return `${hours.toFixed(1)}ч`
  const days = Math.floor(hours / 24)
  const h = Math.round(hours % 24)
  return h > 0 ? `${days}д ${h}ч` : `${days}д`
}

export function complianceColor(rate: number): string {
  if (rate >= 90) return 'text-green-600'
  if (rate >= 70) return 'text-yellow-600'
  return 'text-red-600'
}

export function complianceBg(rate: number): string {
  if (rate >= 90) return 'bg-green-100 text-green-800'
  if (rate >= 70) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}
