import { Link } from 'react-router-dom'
import { ArrowRight, Copy, History, MapPin, RotateCcw, Users, Wrench } from 'lucide-react'

import Card from '@/components/Card'
import { useRepeatMetrics } from '@/hooks/useAnalytics'
import type { ReportPeriod } from '@/types/reports'

const cellHead = 'px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300'

function Tile({
  title,
  value,
  meta,
  icon: Icon,
}: {
  title: string
  value: string | number
  meta: string
  icon: typeof History
}) {
  return (
    <div className="bg-white p-4 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{meta}</p>
    </div>
  )
}

function PlaceList({
  title,
  icon: Icon,
  rows,
}: {
  title: string
  icon: typeof History
  rows: Array<{ key: string; label: string; sublabel?: string; href?: string; tasks: number; returns: number }>
}) {
  return (
    <Card>
      <div className="p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <Icon className="h-4.5 w-4.5 text-gray-500 dark:text-gray-400" />
          {title}
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Мест с несколькими заявками за период нет.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.key} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  {row.href ? (
                    <Link to={row.href} className="break-words text-gray-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400">
                      {row.label}
                    </Link>
                  ) : (
                    <span className="break-words text-gray-900 dark:text-white">{row.label}</span>
                  )}
                  {row.sublabel && <p className="text-xs text-gray-500 dark:text-gray-400">{row.sublabel}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-semibold text-gray-900 dark:text-white">{row.tasks}</span>
                  {row.returns > 0 && (
                    <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">возвр. {row.returns}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

export default function RepeatsSection({ period }: { period: ReportPeriod }) {
  const { data } = useRepeatMetrics(period)
  if (!data) return null

  const { overview, by_worker, top_addresses, top_systems, window_days } = data
  const workers = by_worker.filter((worker) => worker.completed > 0)

  return (
    <section id="repeats" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Повторные заявки</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Возврат — новая заявка на том же адресе и системе за {window_days} дн. после закрытия. По всем исполнителям.
          </p>
        </div>
        <Link
          to="/tasks?repeat=return"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
        >
          Все возвраты
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 dark:border-gray-700 dark:bg-gray-700 md:grid-cols-3">
        <Tile
          title="Доля возвратов"
          value={`${overview.return_rate}%`}
          meta={`${overview.returned} из ${overview.completed} закрытых вернулись`}
          icon={RotateCcw}
        />
        <Tile title="Возвратов" value={overview.returns} meta={`Из ${overview.created} новых заявок`} icon={History} />
        <Tile title="Дублей" value={overview.duplicates} meta="Открытая заявка на месте уже была" icon={Copy} />
      </div>

      {workers.length > 0 && (
        <Card>
          <div className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Users className="h-4.5 w-4.5 text-gray-500 dark:text-gray-400" />
              Возвраты по исполнителям
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className={`${cellHead} text-left`}>Имя</th>
                    <th className={`${cellHead} text-right`}>Закрыто</th>
                    <th className={`${cellHead} text-right`}>Вернулось</th>
                    <th className={`${cellHead} text-right`}>Доля</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {workers.map((worker) => (
                    <tr key={worker.user_id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{worker.user_name}</td>
                      <td className="px-4 py-3 text-right text-sm">{worker.completed}</td>
                      <td className="px-4 py-3 text-right text-sm">{worker.returned}</td>
                      <td
                        className={`px-4 py-3 text-right text-sm font-semibold ${
                          worker.returned > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {worker.return_rate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PlaceList
          title="Адреса с наибольшим числом заявок"
          icon={MapPin}
          rows={top_addresses.map((place, index) => ({
            key: `${place.address_id ?? 'raw'}-${index}`,
            label: place.label,
            href: place.address_id ? `/addresses/${place.address_id}` : undefined,
            tasks: place.tasks,
            returns: place.returns,
          }))}
        />
        <PlaceList
          title="Системы с наибольшим числом заявок"
          icon={Wrench}
          rows={top_systems.map((system) => ({
            key: String(system.system_id),
            label: system.name,
            sublabel: system.address,
            href: system.address_id ? `/addresses/${system.address_id}` : undefined,
            tasks: system.tasks,
            returns: system.returns,
          }))}
        />
      </div>
    </section>
  )
}
