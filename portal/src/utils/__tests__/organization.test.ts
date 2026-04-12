import { describe, expect, it } from 'vitest'

import { buildAdminUsernameSeed, sanitizeUsername } from '../organization'

describe('buildAdminUsernameSeed', () => {
  it('builds ascii-only admin username from organization name', () => {
    expect(buildAdminUsernameSeed('ООО "Эльтон"')).toBe('ooo_elton_admin')
    expect(buildAdminUsernameSeed('Компания ООО «Тест»')).toBe('kompaniya_ooo_test_admin')
    expect(buildAdminUsernameSeed('Acme LLC')).toBe('acme_llc_admin')
  })

  it('falls back when name becomes empty after cleanup', () => {
    expect(buildAdminUsernameSeed('---')).toBe('org_admin')
  })

  it('keeps generated usernames within backend length limit', () => {
    expect(buildAdminUsernameSeed('A'.repeat(200))).toHaveLength(50)
  })
})

describe('sanitizeUsername', () => {
  it('transliterates cyrillic and keeps allowed ascii characters only', () => {
    expect(sanitizeUsername('Иван.Админ-тест')).toBe('ivan.admin-test')
  })

  it('replaces whitespace with underscores and trims invalid edges', () => {
    expect(sanitizeUsername('  Team Lead  ')).toBe('team_lead')
  })
})
