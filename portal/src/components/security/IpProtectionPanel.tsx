import { useEffect, useMemo, useState } from 'react'
import {
  Ban,
  Plus,
  Trash2,
  ShieldAlert,
  Clock,
  Globe,
  AlertTriangle,
  Save,
} from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Spinner from '@/components/Spinner'
import Badge from '@/components/Badge'
import {
  SettingsCard,
  SettingsField,
  SettingsToggle,
  SettingsSelect,
  StatRow,
} from '@/components/settings/SettingsSection'
import { settingsTokens } from '@/components/settings/tokens'
import { cn } from '@/utils/cn'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import { formatDateTime } from '@/utils/dateFormat'
import { useSetting, useUpdateSetting } from '@/hooks/useSettings'
import {
  useSecurityOverview,
  useBlockedIPs,
  useAllowlist,
  useSecurityEvents,
  useBlockIP,
  useUnblockIP,
  useAddAllowlist,
  useRemoveAllowlist,
  type SecurityEvent,
} from '@/hooks/useSecurity'

// Перевод типов событий для ленты
const EVENT_LABELS: Record<string, { label: string; variant: 'danger' | 'warning' | 'info' | 'success' | 'gray' }> = {
  login_failed: { label: 'Неудачный вход', variant: 'warning' },
  auto_banned: { label: 'Авто-бан', variant: 'danger' },
  manual_banned: { label: 'Ручной бан', variant: 'danger' },
  manual_unbanned: { label: 'Разблокировка', variant: 'success' },
  ddos_banned: { label: 'DDoS-бан', variant: 'danger' },
  request_blocked: { label: 'Запрос отклонён', variant: 'gray' },
}

// --- Сводка + пороги авто-бана / DDoS (системные настройки) ---
function ThresholdsSection({ overview }: { overview: ReturnType<typeof useSecurityOverview>['data'] }) {
  const updateSetting = useUpdateSetting()
  // Явные вызовы хуков (rules-of-hooks): порядок и количество фиксированы.
  const protectionEnabled = useSetting('ip_protection_enabled')
  const autobanThreshold = useSetting('ip_autoban_threshold')
  const autobanWindow = useSetting('ip_autoban_window_minutes')
  const banMinutes = useSetting('ip_ban_minutes')
  const ddosEnabled = useSetting('ddos_protection_enabled')
  const ddosMax = useSetting('ddos_max_requests')
  const ddosWindow = useSetting('ddos_window_seconds')
  const ddosBan = useSetting('ddos_ban_minutes')

  const queries = useMemo(
    () => ({
      ip_protection_enabled: protectionEnabled,
      ip_autoban_threshold: autobanThreshold,
      ip_autoban_window_minutes: autobanWindow,
      ip_ban_minutes: banMinutes,
      ddos_protection_enabled: ddosEnabled,
      ddos_max_requests: ddosMax,
      ddos_window_seconds: ddosWindow,
      ddos_ban_minutes: ddosBan,
    }),
    [protectionEnabled, autobanThreshold, autobanWindow, banMinutes, ddosEnabled, ddosMax, ddosWindow, ddosBan],
  )

  const [form, setForm] = useState<Record<string, number | boolean>>({})

  useEffect(() => {
    const next: Record<string, number | boolean> = {}
    for (const [key, q] of Object.entries(queries)) {
      const v = q.data?.value
      if (typeof v === 'number' || typeof v === 'boolean') next[key] = v
    }
    setForm((prev) => ({ ...next, ...prev }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    protectionEnabled.data,
    autobanThreshold.data,
    autobanWindow.data,
    banMinutes.data,
    ddosEnabled.data,
    ddosMax.data,
    ddosWindow.data,
    ddosBan.data,
  ])

  const loading = Object.values(queries).some((q) => q.isLoading)

  const num = (key: string, fallback = 0) => Number(form[key] ?? fallback)
  const bool = (key: string) => Boolean(form[key])
  const setNum = (key: string, v: number) => setForm((p) => ({ ...p, [key]: v }))
  const setBool = (key: string, v: boolean) => setForm((p) => ({ ...p, [key]: v }))

  const handleSave = async () => {
    try {
      const updates: Array<{ key: string; value: number | boolean }> = [
        { key: 'ip_protection_enabled', value: bool('ip_protection_enabled') },
        { key: 'ip_autoban_threshold', value: Math.max(1, num('ip_autoban_threshold', 10)) },
        { key: 'ip_autoban_window_minutes', value: Math.max(1, num('ip_autoban_window_minutes', 15)) },
        { key: 'ip_ban_minutes', value: Math.max(1, num('ip_ban_minutes', 60)) },
        { key: 'ddos_protection_enabled', value: bool('ddos_protection_enabled') },
        { key: 'ddos_max_requests', value: Math.max(10, num('ddos_max_requests', 300)) },
        { key: 'ddos_window_seconds', value: Math.max(5, num('ddos_window_seconds', 60)) },
        { key: 'ddos_ban_minutes', value: Math.max(1, num('ddos_ban_minutes', 15)) },
      ]
      for (const u of updates) await updateSetting.mutateAsync(u)
      showApiSuccess('Настройки IP-защиты сохранены')
    } catch (e) {
      showApiError(e, 'Не удалось сохранить настройки IP-защиты')
    }
  }

  return (
    <SettingsCard
      title="IP-защита"
      icon={ShieldAlert}
      action={
        !loading && (
          <Button size="sm" onClick={handleSave} isLoading={updateSetting.isPending}>
            <Save className="mr-2 h-4 w-4" />
            Сохранить
          </Button>
        )
      }
    >
      <div className={settingsTokens.stack}>
        <div>
          <StatRow label="Активных банов" value={overview?.active_bans ?? '—'} />
          <StatRow label="Неудач входа за 24ч" value={overview?.failed_logins_24h ?? '—'} />
          <StatRow label="Авто-банов за 24ч" value={overview?.auto_bans_24h ?? '—'} />
          <StatRow label="В белом списке" value={overview?.allowlist_count ?? '—'} />
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
              <SettingsToggle
                title="Блокировка по IP"
              description="Авто-бан при переборе паролей."
              checked={bool('ip_protection_enabled')}
              onChange={(v) => setBool('ip_protection_enabled', v)}
            />
            <div className={cn('mt-3', settingsTokens.grid3)}>
              <SettingsField label="Порог, неудач">
                <Input type="number" value={num('ip_autoban_threshold', 10)} onChange={(e) => setNum('ip_autoban_threshold', Number(e.target.value) || 0)} />
              </SettingsField>
              <SettingsField label="Окно, мин">
                <Input type="number" value={num('ip_autoban_window_minutes', 15)} onChange={(e) => setNum('ip_autoban_window_minutes', Number(e.target.value) || 0)} />
              </SettingsField>
              <SettingsField label="Бан, мин">
                <Input type="number" value={num('ip_ban_minutes', 60)} onChange={(e) => setNum('ip_ban_minutes', Number(e.target.value) || 0)} />
              </SettingsField>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
            <SettingsToggle
              title="Защита от всплесков (DDoS)"
              description="Авто-бан IP при слишком частых запросах."
              checked={bool('ddos_protection_enabled')}
              onChange={(v) => setBool('ddos_protection_enabled', v)}
            />
            <div className={cn('mt-3', settingsTokens.grid3)}>
              <SettingsField label="Лимит запросов">
                <Input type="number" value={num('ddos_max_requests', 300)} onChange={(e) => setNum('ddos_max_requests', Number(e.target.value) || 0)} />
              </SettingsField>
              <SettingsField label="Окно, сек">
                <Input type="number" value={num('ddos_window_seconds', 60)} onChange={(e) => setNum('ddos_window_seconds', Number(e.target.value) || 0)} />
              </SettingsField>
              <SettingsField label="Бан, мин">
                <Input type="number" value={num('ddos_ban_minutes', 15)} onChange={(e) => setNum('ddos_ban_minutes', Number(e.target.value) || 0)} />
              </SettingsField>
            </div>
            </div>
          </>
        )}

        <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Заблокированные IP
          </p>
          <BlockForm />
          <div className="mt-3">
            <BlockedTable />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <Globe className="h-3.5 w-3.5" />
            Белый список
          </p>
          <AllowlistSection />
        </div>

        <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <Clock className="h-3.5 w-3.5" />
            Последние события
          </p>
          <EventsFeed />
        </div>
      </div>
    </SettingsCard>
  )
}

// --- Форма ручной блокировки ---
const DURATIONS: Array<{ label: string; minutes: number | null; permanent: boolean }> = [
  { label: '15 минут', minutes: 15, permanent: false },
  { label: '1 час', minutes: 60, permanent: false },
  { label: '24 часа', minutes: 1440, permanent: false },
  { label: '7 дней', minutes: 10080, permanent: false },
  { label: 'Навсегда', minutes: null, permanent: true },
]

function BlockForm() {
  const blockIp = useBlockIP()
  const [ip, setIp] = useState('')
  const [reason, setReason] = useState('')
  const [durationIdx, setDurationIdx] = useState(1)

  const submit = async () => {
    const trimmed = ip.trim()
    if (!trimmed) return
    const d = DURATIONS[durationIdx] ?? DURATIONS[1]!
    try {
      await blockIp.mutateAsync({ ip_address: trimmed, reason: reason.trim() || undefined, minutes: d.minutes, permanent: d.permanent })
      showApiSuccess(`IP ${trimmed} заблокирован`)
      setIp('')
      setReason('')
    } catch (e) {
      showApiError(e, 'Не удалось заблокировать IP')
    }
  }

  return (
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr_auto]">
      <SettingsField label="IP-адрес">
        <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="203.0.113.10" />
      </SettingsField>
      <SettingsField label="Срок">
        <SettingsSelect value={durationIdx} onChange={(e) => setDurationIdx(Number(e.target.value))}>
          {DURATIONS.map((d, i) => (
            <option key={d.label} value={i}>{d.label}</option>
          ))}
        </SettingsSelect>
      </SettingsField>
      <SettingsField label="Причина (необязательно)">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Подозрительная активность" />
      </SettingsField>
      <Button variant="danger" size="sm" onClick={submit} isLoading={blockIp.isPending} disabled={!ip.trim()}>
        <Ban className="mr-2 h-4 w-4" /> Заблокировать
      </Button>
    </div>
  )
}

// --- Список заблокированных ---
function BlockedTable() {
  const { data: blocked, isLoading } = useBlockedIPs(false)
  const unblock = useUnblockIP()

  const handleUnblock = async (ip: string) => {
    try {
      await unblock.mutateAsync(ip)
      showApiSuccess(`IP ${ip} разблокирован`)
    } catch (e) {
      showApiError(e, 'Не удалось разблокировать IP')
    }
  }

  if (isLoading) return <div className="flex justify-center py-4"><Spinner /></div>
  if (!blocked || blocked.length === 0) {
    return <p className="py-2 text-sm text-gray-500 dark:text-gray-400">Заблокированных IP нет.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700 dark:text-gray-400">
          <tr>
            <th className="py-1.5 pr-3">IP</th>
            <th className="py-1.5 pr-3">Причина</th>
            <th className="py-1.5 pr-3">Источник</th>
            <th className="py-1.5 pr-3">Истекает</th>
            <th className="py-1.5 pr-3">Откл.</th>
            <th className="py-1.5 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          {blocked.map((b) => (
            <tr key={b.id} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-1.5 pr-3 font-mono">{b.ip_address}</td>
              <td className="max-w-[260px] truncate py-1.5 pr-3 text-gray-600 dark:text-gray-300" title={b.reason ?? ''}>{b.reason}</td>
              <td className="py-1.5 pr-3">
                <Badge variant={b.is_manual ? 'info' : 'warning'}>{b.is_manual ? 'вручную' : 'авто'}</Badge>
              </td>
              <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300">
                {b.is_permanent || !b.expires_at ? <Badge variant="danger">навсегда</Badge> : formatDateTime(b.expires_at)}
              </td>
              <td className="py-1.5 pr-3 text-gray-500">{b.hit_count}</td>
              <td className="py-1.5 pr-3 text-right">
                <Button size="sm" variant="ghost" onClick={() => handleUnblock(b.ip_address)}>
                  Разблокировать
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- Белый список ---
function AllowlistSection() {
  const { data: list, isLoading } = useAllowlist()
  const addAllow = useAddAllowlist()
  const removeAllow = useRemoveAllowlist()
  const [ip, setIp] = useState('')
  const [note, setNote] = useState('')

  const add = async () => {
    const trimmed = ip.trim()
    if (!trimmed) return
    try {
      await addAllow.mutateAsync({ ip: trimmed, note: note.trim() || undefined })
      showApiSuccess(`IP ${trimmed} добавлен в белый список`)
      setIp('')
      setNote('')
    } catch (e) {
      showApiError(e, 'Не удалось добавить IP в белый список')
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <SettingsField label="IP-адрес">
          <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="198.51.100.5" />
        </SettingsField>
        <SettingsField label="Заметка">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Офис / мониторинг" />
        </SettingsField>
        <Button variant="secondary" size="sm" onClick={add} isLoading={addAllow.isPending} disabled={!ip.trim()}>
          <Plus className="mr-2 h-4 w-4" /> Добавить
        </Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : !list || list.length === 0 ? (
        <p className="py-2 text-sm text-gray-500 dark:text-gray-400">Белый список пуст.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {list.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-mono">{a.ip_address}</span>
              <span className="flex-1 truncate px-3 text-gray-500">{a.note}</span>
              <Button size="sm" variant="ghost" onClick={() => removeAllow.mutate(a.ip_address)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// --- Лента событий ---
function EventsFeed() {
  const { data: events, isLoading } = useSecurityEvents({ limit: 50 })

  if (isLoading) return <div className="flex justify-center py-4"><Spinner /></div>
  if (!events || events.length === 0) {
    return <p className="py-2 text-sm text-gray-500 dark:text-gray-400">Событий пока нет.</p>
  }

  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800">
      <table className="w-full text-sm">
        <tbody>
          {events.map((ev: SecurityEvent) => {
            const meta = EVENT_LABELS[ev.event_type] ?? { label: ev.event_type, variant: 'gray' as const }
            return (
              <tr key={ev.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                <td className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-400">{formatDateTime(ev.created_at)}</td>
                <td className="px-3 py-1.5"><Badge variant={meta.variant}>{meta.label}</Badge></td>
                <td className="px-3 py-1.5 font-mono">{ev.ip_address}</td>
                <td className="max-w-[220px] truncate px-3 py-1.5 text-gray-500" title={ev.username || ev.detail || ''}>
                  {ev.username ? `логин: ${ev.username}` : ev.detail}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function IpProtectionPanel() {
  const { data: overview } = useSecurityOverview()

  const proxyWarning = useMemo(() => overview && !overview.trust_proxy_headers, [overview])

  return (
    <div className={settingsTokens.stack}>
      {proxyWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            TRUST_PROXY_HEADERS выключен. Если сервер работает за реверс-прокси (Caddy/nginx), все клиенты
            определяются как один IP — включите флаг в server/.env, иначе бан по IP будет неточным.
          </span>
        </div>
      )}

      <ThresholdsSection overview={overview} />
    </div>
  )
}
