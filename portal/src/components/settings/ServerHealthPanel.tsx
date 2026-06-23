import { Activity, Cpu, ExternalLink, HardDrive, MemoryStick, RefreshCw, Server } from 'lucide-react'
import type { ContainerInfo, SystemHealth } from '@/api/system'
import { useSystemHealth } from '@/hooks/useSystemHealth'
import Badge from '@/components/Badge'
import Spinner from '@/components/Spinner'
import { SettingsCard } from '@/components/settings/SettingsSection'

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}д ${h}ч`
  if (h > 0) return `${h}ч ${m}м`
  return `${m}м`
}

function MetricCard({
  icon: Icon,
  label,
  value,
  percent,
}: {
  icon: typeof Cpu
  label: string
  value: string
  percent?: number
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{value}</div>
      {percent != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={
              percent >= 90
                ? 'h-full bg-red-500'
                : percent >= 75
                  ? 'h-full bg-amber-500'
                  : 'h-full bg-emerald-500'
            }
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

const STATE_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'gray'> = {
  running: 'success',
  restarting: 'warning',
  paused: 'warning',
  exited: 'danger',
  dead: 'danger',
  created: 'gray',
}

function ContainerRow({ c }: { c: ContainerInfo }) {
  const healthBadge =
    c.health === 'healthy' ? (
      <Badge variant="success">healthy</Badge>
    ) : c.health === 'unhealthy' ? (
      <Badge variant="danger">unhealthy</Badge>
    ) : c.health === 'starting' ? (
      <Badge variant="warning">starting</Badge>
    ) : null
  return (
    <tr className="border-b border-gray-100 last:border-0 dark:border-gray-800">
      <td className="px-3 py-1.5 font-medium text-gray-800 dark:text-gray-200">{c.name}</td>
      <td className="px-3 py-1.5">
        <Badge variant={STATE_VARIANT[c.state] ?? 'gray'}>{c.state || '—'}</Badge>
      </td>
      <td className="px-3 py-1.5">{healthBadge ?? <span className="text-gray-400">—</span>}</td>
      <td className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400">{c.status}</td>
    </tr>
  )
}

function ServiceRow({ label, status, detail }: { label: string; status: 'ok' | 'warn' | 'bad'; detail?: string }) {
  const variant = status === 'ok' ? 'success' : status === 'warn' ? 'warning' : 'danger'
  const text = status === 'ok' ? 'OK' : status === 'warn' ? 'не настроено' : 'ошибка'
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <span className="flex items-center gap-2">
        {detail && <span className="text-xs text-gray-500 dark:text-gray-400">{detail}</span>}
        <Badge variant={variant}>{text}</Badge>
      </span>
    </div>
  )
}

function HealthBody({ data }: { data: SystemHealth }) {
  const { system, database, redis, backup_scheduler, websocket, containers } = data
  return (
    <div className="space-y-4">
      {/* Ресурсы хоста */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard icon={Cpu} label="CPU" value={`${system.cpu_percent}%`} percent={system.cpu_percent} />
        <MetricCard
          icon={MemoryStick}
          label="Память"
          value={`${system.memory.used_mb} / ${system.memory.total_mb} МБ`}
          percent={system.memory.percent}
        />
        <MetricCard
          icon={HardDrive}
          label="Диск"
          value={`${system.disk.used_gb} / ${system.disk.total_gb} ГБ`}
          percent={system.disk.percent}
        />
        <MetricCard icon={Activity} label="Uptime" value={formatUptime(system.uptime_seconds)} />
      </div>

      {/* Сервисы */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ServiceRow
          label="База данных"
          status={database.status === 'ok' ? 'ok' : 'bad'}
          detail={database.engine ?? database.error}
        />
        <ServiceRow
          label="Redis"
          status={redis.status === 'ok' ? 'ok' : redis.status === 'not_configured' ? 'warn' : 'bad'}
          detail={redis.error}
        />
        <ServiceRow
          label="Бэкап-планировщик"
          status={!backup_scheduler.enabled ? 'warn' : backup_scheduler.running ? 'ok' : 'bad'}
          detail={backup_scheduler.enabled ? backup_scheduler.schedule : 'выключен'}
        />
        <ServiceRow
          label="WebSocket"
          status="ok"
          detail={`${websocket.active_connections ?? 0} подкл. · ${websocket.unique_users ?? 0} польз.`}
        />
      </div>

      {/* Контейнеры */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Контейнеры</h4>
        {!containers.available ? (
          <p className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            Статус контейнеров недоступен{containers.reason ? `: ${containers.reason}` : ''}. Нужен
            запущенный docker-socket-proxy (DOCKER_PROXY_URL).
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 dark:bg-gray-800/60">
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  <th className="px-3 py-2 font-medium">Контейнер</th>
                  <th className="px-3 py-2 font-medium">Состояние</th>
                  <th className="px-3 py-2 font-medium">Health</th>
                  <th className="px-3 py-2 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {(containers.containers ?? []).map((c) => (
                  <ContainerRow key={c.name} c={c} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ServerHealthPanel() {
  const { data, isLoading, isError, error, isFetching } = useSystemHealth()

  const overall = data?.status
  const statusBadge = overall ? (
    <Badge variant={overall === 'ok' ? 'success' : 'danger'}>
      {overall === 'ok' ? 'Всё в норме' : 'Есть проблемы'}
    </Badge>
  ) : null

  return (
    <SettingsCard
      title="Состояние сервера"
      icon={Server}
      description="Ресурсы хоста, сервисы и контейнеры. Обновляется автоматически каждые 10 секунд."
      action={
        <span className="flex items-center gap-2">
          {data?.monitoring?.grafana_url && (
            <a
              href={data.monitoring.grafana_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Grafana
            </a>
          )}
          {isFetching && <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />}
          {statusBadge}
        </span>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : isError ? (
        <p className="py-4 text-sm text-red-500">
          Не удалось загрузить состояние сервера: {(error as Error)?.message ?? 'ошибка'}
        </p>
      ) : data ? (
        <HealthBody data={data} />
      ) : null}
    </SettingsCard>
  )
}
