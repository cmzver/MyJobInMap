import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { cabinetApi } from '@/api/cabinet'
import { formatRub } from '@/components/acts/actLabels'
import { formatDateOnly } from '@/utils/dateFormat'
import { cn } from '@/utils/cn'
import Card from '@/components/Card'
import QueryStatePanel from '@/components/QueryStatePanel'

const SYSTEM_TYPES: Record<string, string> = {
  intercom: 'Домофония',
  video_surveillance: 'Видеонаблюдение',
  fire_protection: 'Пожарная защита',
  access_control: 'СКУД',
  fire_alarm: 'Пожарная сигнализация',
  other: 'Прочее',
}
const SYSTEM_STATUS: Record<string, string> = {
  active: 'обслуживается',
  maintenance: 'на ремонте',
  disabled: 'отключена',
}

export default function CabinetObjectsPage() {
  const objects = useQuery({ queryKey: ['cabinet', 'objects'], queryFn: cabinetApi.objects })

  if (objects.isPending) return <QueryStatePanel state="loading" />
  if (objects.isError) return <QueryStatePanel state="error" onRetry={() => objects.refetch()} />
  const monthly = objects.data.reduce(
    (sum, object) =>
      sum + object.systems.filter((s) => s.status !== 'disabled').reduce((acc, s) => acc + Number(s.monthly_cost ?? 0), 0),
    0,
  )
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="mr-auto text-xl font-semibold text-gray-900 dark:text-white">Объекты · {objects.data.length}</h1>
        {monthly > 0 && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            абонплата в месяц: <span className="font-semibold text-gray-900 dark:text-white">{formatRub(monthly)}</span>
          </span>
        )}
      </div>
      {objects.data.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400">Объекты пока не привязаны.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {objects.data.map((object) => (
            <Card key={object.id} flush>
              <div className="flex items-start gap-3 px-4 py-3">
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">{object.address}</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    <Link
                      to={`/client?status=all&address=${object.id}`}
                      className={cn(object.open_tasks > 0 ? 'text-primary-600 dark:text-primary-400' : '', 'hover:underline')}
                    >
                      {object.open_tasks > 0 ? `заявок в работе: ${object.open_tasks}` : 'все заявки'}
                    </Link>
                    {object.next_maintenance && ` · ТО ${formatDateOnly(object.next_maintenance)}`}
                  </p>
                </div>
              </div>
              {object.systems.length > 0 && (
                <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-700 dark:border-gray-700">
                  {object.systems.map((system) => (
                    <li key={system.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate text-gray-900 dark:text-white', system.status === 'disabled' && 'text-gray-400')}>
                          {system.name}
                        </p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {SYSTEM_TYPES[system.system_type] ?? system.system_type} · {SYSTEM_STATUS[system.status] ?? system.status}
                          {system.contract_number && ` · договор ${system.contract_number}`}
                        </p>
                      </div>
                      {Number(system.monthly_cost) > 0 && (
                        <span className="shrink-0 text-xs tabular-nums text-gray-600 dark:text-gray-300">
                          {formatRub(Number(system.monthly_cost))}/мес
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
