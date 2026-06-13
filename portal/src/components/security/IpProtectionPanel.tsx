import { useEffect, useMemo, useState } from 'react'
import {
  Ban,
  Plus,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Globe,
  AlertTriangle,
  ListChecks,
  Save,
} from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Spinner from '@/components/Spinner'
import Badge from '@/components/Badge'
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

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof Ban; label: string; value: number | string; tone: string }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
        <Icon className={`h-4 w-4 ${tone}`} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{value}</div>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, action }: { icon: typeof Ban; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between pt-2">
      <div className="flex items-center gap-2 text-gray-900 dark:text-white">
        <Icon className="h-4 w-4 text-primary-600" />
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      {action}
    </div>
  )
}

// --- Пороги авто-бана / DDoS (системные настройки) ---
function ThresholdsSection() {
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

  if (loading) {
    return <div className="flex justify-center py-6"><Spinner /></div>
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200">
        <input
          type="checkbox"
          checked={bool('ip_protection_enabled')}
          onChange={(e) => setBool('ip_protection_enabled', e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        Блокировка по IP и авто-бан при переборе паролей
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-7">
        <NumField label="Порог (неудач)" value={num('ip_autoban_threshold', 10)} onChange={(v) => setNum('ip_autoban_threshold', v)} />
        <NumField label="Окно (мин)" value={num('ip_autoban_window_minutes', 15)} onChange={(v) => setNum('ip_autoban_window_minutes', v)} />
        <NumField label="Бан (мин)" value={num('ip_ban_minutes', 60)} onChange={(v) => setNum('ip_ban_minutes', v)} />
      </div>

      <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200 pt-2">
        <input
          type="checkbox"
          checked={bool('ddos_protection_enabled')}
          onChange={(e) => setBool('ddos_protection_enabled', e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        Защита от всплесков запросов (DDoS)
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-7">
        <NumField label="Лимит запросов" value={num('ddos_max_requests', 300)} onChange={(v) => setNum('ddos_max_requests', v)} />
        <NumField label="Окно (сек)" value={num('ddos_window_seconds', 60)} onChange={(v) => setNum('ddos_window_seconds', v)} />
        <NumField label="Бан (мин)" value={num('ddos_ban_minutes', 15)} onChange={(v) => setNum('ddos_ban_minutes', v)} />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} isLoading={updateSetting.isPending}>
          <Save className="h-4 w-4 mr-2" /> Сохранить пороги
        </Button>
      </div>
    </div>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-xs text-gray-500 dark:text-gray-400">
      <span className="mb-1 block">{label}</span>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
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
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] gap-2 items-end">
      <label className="block text-xs text-gray-500 dark:text-gray-400">
        <span className="mb-1 block">IP-адрес</span>
        <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="203.0.113.10" />
      </label>
      <label className="block text-xs text-gray-500 dark:text-gray-400">
        <span className="mb-1 block">Срок</span>
        <select
          value={durationIdx}
          onChange={(e) => setDurationIdx(Number(e.target.value))}
          className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm"
        >
          {DURATIONS.map((d, i) => (
            <option key={d.label} value={i}>{d.label}</option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-gray-500 dark:text-gray-400">
        <span className="mb-1 block">Причина (необязательно)</span>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Подозрительная активность" />
      </label>
      <Button variant="danger" onClick={submit} isLoading={blockIp.isPending} disabled={!ip.trim()}>
        <Ban className="h-4 w-4 mr-2" /> Заблокировать
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

  if (isLoading) return <div className="flex justify-center py-6"><Spinner /></div>
  if (!blocked || blocked.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Заблокированных IP нет.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="py-2 pr-3">IP</th>
            <th className="py-2 pr-3">Причина</th>
            <th className="py-2 pr-3">Источник</th>
            <th className="py-2 pr-3">Истекает</th>
            <th className="py-2 pr-3">Откл.</th>
            <th className="py-2 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          {blocked.map((b) => (
            <tr key={b.id} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-2 pr-3 font-mono">{b.ip_address}</td>
              <td className="py-2 pr-3 text-gray-600 dark:text-gray-300 max-w-[260px] truncate" title={b.reason ?? ''}>{b.reason}</td>
              <td className="py-2 pr-3">
                <Badge variant={b.is_manual ? 'info' : 'warning'}>{b.is_manual ? 'вручную' : 'авто'}</Badge>
              </td>
              <td className="py-2 pr-3 text-gray-600 dark:text-gray-300">
                {b.is_permanent || !b.expires_at ? <Badge variant="danger">навсегда</Badge> : formatDateTime(b.expires_at)}
              </td>
              <td className="py-2 pr-3 text-gray-500">{b.hit_count}</td>
              <td className="py-2 pr-3 text-right">
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
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <label className="block text-xs text-gray-500 dark:text-gray-400">
          <span className="mb-1 block">IP-адрес</span>
          <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="198.51.100.5" />
        </label>
        <label className="block text-xs text-gray-500 dark:text-gray-400">
          <span className="mb-1 block">Заметка</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Офис / мониторинг" />
        </label>
        <Button variant="secondary" onClick={add} isLoading={addAllow.isPending} disabled={!ip.trim()}>
          <Plus className="h-4 w-4 mr-2" /> Добавить
        </Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : !list || list.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Белый список пуст.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {list.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-mono">{a.ip_address}</span>
              <span className="flex-1 px-3 text-gray-500 truncate">{a.note}</span>
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

  if (isLoading) return <div className="flex justify-center py-6"><Spinner /></div>
  if (!events || events.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Событий пока нет.</p>
  }

  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800">
      <table className="w-full text-sm">
        <tbody>
          {events.map((ev: SecurityEvent) => {
            const meta = EVENT_LABELS[ev.event_type] ?? { label: ev.event_type, variant: 'gray' as const }
            return (
              <tr key={ev.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                <td className="py-2 px-3 whitespace-nowrap text-gray-400 text-xs">{formatDateTime(ev.created_at)}</td>
                <td className="py-2 px-3"><Badge variant={meta.variant}>{meta.label}</Badge></td>
                <td className="py-2 px-3 font-mono">{ev.ip_address}</td>
                <td className="py-2 px-3 text-gray-500 truncate max-w-[220px]" title={ev.username || ev.detail || ''}>
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Ban} label="Активных банов" value={overview?.active_bans ?? '—'} tone="text-red-500" />
        <StatCard icon={ShieldAlert} label="Неудач входа 24ч" value={overview?.failed_logins_24h ?? '—'} tone="text-orange-500" />
        <StatCard icon={ShieldCheck} label="Авто-банов 24ч" value={overview?.auto_bans_24h ?? '—'} tone="text-purple-500" />
        <StatCard icon={ListChecks} label="В белом списке" value={overview?.allowlist_count ?? '—'} tone="text-green-500" />
      </div>

      {proxyWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            TRUST_PROXY_HEADERS выключен. Если сервер работает за реверс-прокси (Caddy/nginx), все клиенты
            определяются как один IP — включите флаг в server/.env, иначе бан по IP будет неточным.
          </span>
        </div>
      )}

      <ThresholdsSection />

      <SectionTitle icon={Ban} title="Заблокированные IP" />
      <BlockForm />
      <BlockedTable />

      <SectionTitle icon={Globe} title="Белый список" />
      <AllowlistSection />

      <SectionTitle icon={Clock} title="Последние события" />
      <EventsFeed />
    </div>
  )
}
