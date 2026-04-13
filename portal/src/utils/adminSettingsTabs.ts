/**
 * Panel-based navigation for AdminSettingsPage.
 *
 * AdminSettingsPage uses `?panel=<id>` URL parameter.
 * This module maps legacy aliases to the correct panel IDs.
 */

export type SettingsPanelId =
  | 'overview'
  | 'backups'
  | 'security'
  | 'interface'
  | 'portal-branding'
  | 'mobile-updates'
  | 'mobile-notifications'
  | 'mobile-devices'
  | 'task-defaults'
  | 'task-media'
  | 'task-fields'
  | 'task-layout'
  | 'permissions-matrix'
  | 'telegram-bot'

/** Legacy aliases kept for callers that still use old names */
type PanelAlias =
  | SettingsPanelId
  | 'updates'
  | 'devices'
  | 'notifications'
  | 'images'
  | 'custom-fields'
  | 'card-builder'

const panelAliases: Record<Exclude<PanelAlias, SettingsPanelId>, SettingsPanelId> = {
  updates: 'mobile-updates',
  devices: 'mobile-devices',
  notifications: 'mobile-notifications',
  images: 'task-media',
  'custom-fields': 'task-fields',
  'card-builder': 'task-layout',
}

function resolvePanelId(alias?: PanelAlias): SettingsPanelId {
  if (!alias) return 'overview'
  if (alias in panelAliases) {
    return panelAliases[alias as Exclude<PanelAlias, SettingsPanelId>]
  }
  return alias as SettingsPanelId
}

export function getAdminSettingsPath(panel?: PanelAlias): string {
  const resolved = resolvePanelId(panel)
  if (resolved === 'overview') return '/admin/settings'
  return `/admin/settings?panel=${resolved}`
}