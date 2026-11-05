import { useQuery } from '@tanstack/react-query'
import { cabinetApi, type CabinetMaintenance } from '@/api/cabinet'
import { formatDateOnly } from '@/utils/dateFormat'
import Card from '@/components/Card'
import QueryStatePanel from '@/components/QueryStatePanel'
import { EmptyLine } from './CabinetShared'

const EVERY: Record<string, [string, string]> = {
  monthly: ['каждый месяц', 'мес'],
  weekly: ['каждую неделю', 'нед'],
  daily: ['каждый день', 'дн'],
}

function every(plan: CabinetMaintenance): string {
  const [single, unit] = EVERY[plan.frequency] ?? ['каждый месяц', 'мес']
  return plan.interval === 1 ? single : `раз в ${plan.interval} ${unit}`
}

export default function CabinetMaintenancePage() {
  const plans = useQuery({ queryKey: ['cabinet', 'maintenance'], queryFn: cabinetApi.maintenance })
  return (
    <>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Плановое обслуживание</h1>
      <Card flush>
        {plans.isPending ? (
          <QueryStatePanel state="loading" />
        ) : plans.isError ? (
          <QueryStatePanel state="error" onRetry={() => plans.refetch()} />
        ) : plans.data.length === 0 ? (
          <EmptyLine>Регламентное ТО по вашим объектам не запланировано.</EmptyLine>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Объект</th>
                  <th>Работы</th>
                  <th className="w-36">Периодичность</th>
                  <th className="w-28">Последнее</th>
                  <th className="w-28">Следующее</th>
                </tr>
              </thead>
              <tbody>
                {plans.data.map((plan) => (
                  <tr key={plan.plan_id}>
                    <td>{plan.address}</td>
                    <td>{plan.title}</td>
                    <td className="whitespace-nowrap">{every(plan)}</td>
                    <td className="whitespace-nowrap tabular-nums">{plan.last_done_at ? formatDateOnly(plan.last_done_at) : '—'}</td>
                    <td className="whitespace-nowrap tabular-nums font-medium">{plan.next_date ? formatDateOnly(plan.next_date) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
