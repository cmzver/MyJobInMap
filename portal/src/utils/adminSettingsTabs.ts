export const ADMIN_SETTINGS_TABS = [
  'system',
  'mobile',
  'tasks',
  'permissions',
] as const

export type AdminSettingsTabId = (typeof ADMIN_SETTINGS_TABS)[number]

export type AdminSettingsTabAlias =
  | AdminSettingsTabId
  | 'general'
  | 'backup'
  | 'security'
  | 'updates'
  | 'devices'
  | 'notifications'
  | 'images'
  | 'custom-fields'
  | 'card-builder'

const adminSettingsTabsSet = new Set<string>(ADMIN_SETTINGS_TABS)

const adminSettingsTabAliases: Record<Exclude<AdminSettingsTabAlias, AdminSettingsTabId>, AdminSettingsTabId> = {
  general: 'system',
  backup: 'system',
  security: 'system',
  updates: 'mobile',
  devices: 'mobile',
  notifications: 'mobile',
  images: 'tasks',
  'custom-fields': 'tasks',
  'card-builder': 'tasks',
}

export function isAdminSettingsTabId(value: string | null): value is AdminSettingsTabId {
  return value !== null && adminSettingsTabsSet.has(value)
}

export function resolveAdminSettingsTabId(value: string | null): AdminSettingsTabId {
  if (isAdminSettingsTabId(value)) {
    return value
  }

  if (value && value in adminSettingsTabAliases) {
    return adminSettingsTabAliases[value as Exclude<AdminSettingsTabAlias, AdminSettingsTabId>]
  }

  return 'system'
}

export function getAdminSettingsPath(tab?: AdminSettingsTabAlias): string {
  if (tab === 'updates') {
    return '/admin/settings?tab=mobile#mobile-updates'
  }

  const resolvedTab = resolveAdminSettingsTabId(tab ?? null)

  if (resolvedTab === 'system') {
    return '/admin/settings'
  }

  return `/admin/settings?tab=${resolvedTab}`
}