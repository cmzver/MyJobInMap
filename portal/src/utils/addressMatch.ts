/**
 * Похожи ли два адреса на один и тот же дом.
 *
 * Разборщик пишет «Ленина ул.», в базе может лежать «ул. Ленина»; у старых
 * записей улица и дом не разобраны вовсе — тогда берём их из строки адреса.
 */

const STREET_TYPES =
  /(^|\s)(ул|улица|пр|пр-кт|просп|проспект|пер|переулок|ш|шоссе|наб|набережная|б-р|бул|бульвар|пл|площадь|проезд|линия|тупик|аллея)\.?(?=\s|$)/g

export function streetKey(street: string | null | undefined): string {
  return (street ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,]/g, ' ')
    .replace(STREET_TYPES, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function numberKey(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^0-9a-zа-я]/g, '')
}

/** Дом и корпус из строки «ул. Ленина, д. 10, корп. 2, кв. 5». */
export function houseFromAddress(address: string): { building: string; corpus: string } {
  const text = address.toLowerCase()
  const withoutFlat = text.replace(/,?\s*(кв|квартира|оф|офис|под|подъезд|парадная)\.?\s*\d+\S*/g, '')
  const corpus = withoutFlat.match(/(?:корп|корпус|к)\.?\s*(\d+[а-я]?)/)?.[1] ?? ''
  const building =
    withoutFlat.match(/(?:^|[\s,])(?:д|дом)\.?\s*(\d+[а-я]?(?:\/\d+)?)/)?.[1] ??
    withoutFlat.replace(/(?:корп|корпус|к)\.?\s*\d+[а-я]?/g, '').match(/(?:^|[\s,])(\d+[а-я]?(?:\/\d+)?)(?=[\s,]|$)/)?.[1] ??
    ''
  return { building, corpus }
}

interface HouseLike {
  address: string
  street?: string | null
  building?: string | null
  corpus?: string | null
}

export function isSameHouse(
  candidate: HouseLike,
  target: { street: string; building: string; corpus: string },
): boolean {
  const fromText = houseFromAddress(candidate.address)
  const building = candidate.building || fromText.building
  const corpus = candidate.building ? candidate.corpus ?? '' : fromText.corpus
  const street = streetKey(candidate.street) || streetKey(candidate.address)

  const targetStreet = streetKey(target.street)
  if (!targetStreet || !street.includes(targetStreet)) return false
  return numberKey(building) === numberKey(target.building) && numberKey(corpus) === numberKey(target.corpus)
}
