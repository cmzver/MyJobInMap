const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}

function transliterateToLatin(value: string): string {
  return Array.from(value.toLowerCase(), (char) => CYRILLIC_TO_LATIN_MAP[char] ?? char).join('')
}

function stripDiacritics(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}

export function sanitizeUsername(value: string): string {
  return stripDiacritics(transliterateToLatin(value))
    .replace(/[^a-z0-9._\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 50)
}

export function buildAdminUsernameSeed(name: string): string {
  const suffix = '_admin'
  const maxBaseLength = 50 - suffix.length
  const base = sanitizeUsername(name)
    .replace(/[.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, maxBaseLength)

  return base ? `${base}${suffix}` : 'org_admin'
}
