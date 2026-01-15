/**
 * FinancePage - Financial statistics and worker performance
 * Features: stats cards, period filters, worker stats table
 */

import { useState } from 'react'
import toast from 'react-hot-toast'
import { 
  DollarSign, 
  RefreshCw, 
  CheckCircle, 
  Home,
  TrendingUp,
  User,
  Calendar,
  Download
} from 'lucide-react'
import { format } from 'date-fns'
import { useFinanceStats, useWorkerStats } from '@/hooks/useApi'
import { useUsers } from '@/hooks/useUsers'
import Button from '@/components/Button'
import Select from '@/components/Select'
import Spinner from '@/components/Spinner'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/Card'

type Period = 'all' | 'month' | 'week'

const periodOptions = [
  { value: 'all', label: 'Всё время' },
  { value: 'month', label: 'За месяц' },
  { value: 'week', label: 'За неделю' },
]

function formatCurrency(amount: number | undefined): string {
  if (!amount) return '0 ₽'
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function FinancePage() {
  const [period, setPeriod] = useState<Period>('all')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  
  const { data: users } = useUsers()
  const { 
    data: stats, 
    isLoading: statsLoading, 
    refetch: refetchStats,
    isFetching: statsFetching 
  } = useFinanceStats(
    period,
    selectedUserId ? Number(selectedUserId) : undefined
  )
  const { 
    data: workerStats, 
    isLoading: workersLoading,
    refetch: refetchWorkers,
    isFetching: workersFetching 
  } = useWorkerStats(period)

  const isFetching = statsFetching || workersFetching
  
  const handleRefresh = () => {
    refetchStats()
    refetchWorkers()
  }
  
  const workers = users?.filter(u => u.role === 'worker') || []

  const handleExport = () => {
    // Simple CSV export
    if (!workerStats?.length) {
      toast.error('Нет данных для экспорта')
      return
    }
    
    const headers = ['Исполнитель', 'Всего', 'Выполнено', 'В работе', 'Платных', 'Удалённых', 'Заработано']
    const rows = workerStats.map(w => [
      w.user_name,
      w.total_tasks,
      w.completed_tasks,
      w.in_progress_tasks,
      w.paid_tasks,
      w.remote_tasks,
      w.total_earned,
    ])
    
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `finance_${period}_${format(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    URL.revokeObjectURL(url)
    
    toast.success('Отчёт экспортирован')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Финансы и статистика</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Отслеживание выполненных работ и заработка
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={period}
            onChange={(v) => setPeriod(v as Period)}
            options={periodOptions}
            className="w-40"
          />
          <Select
            value={selectedUserId}
            onChange={(v) => setSelectedUserId(v)}
            options={[
              { value: '', label: 'Все исполнители' },
              ...workers.map(w => ({ value: String(w.id), label: w.full_name || w.username }))
            ]}
            className="w-48"
          />
          <Button
            variant="secondary"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {statsLoading ? '...' : stats?.completed_tasks || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Выполнено заявок</p>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <DollarSign className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {statsLoading ? '...' : stats?.paid_tasks || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Платных заявок</p>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <Home className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {statsLoading ? '...' : stats?.remote_tasks || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Удалённых заявок</p>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <TrendingUp className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {statsLoading ? '...' : formatCurrency(stats?.total_amount)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Общая сумма</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Workers Stats Table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <User className="w-5 h-5" />
            Статистика по исполнителям
          </h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            disabled={!workerStats?.length}
          >
            <Download className="w-4 h-4" />
            Экспорт CSV
          </Button>
        </div>
        
        <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Исполнитель
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Всего заявок
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Выполнено
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  В работе
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Платных
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Удалённых
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Заработано
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {workersLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Spinner size="lg" />
                  </td>
                </tr>
              ) : !workerStats?.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12">
                    <EmptyState
                      icon={User}
                      title="Нет данных"
                      description="Статистика появится после выполнения заявок"
                    />
                  </td>
                </tr>
              ) : (
                workerStats.map((worker) => (
                  <tr 
                    key={worker.user_id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                          <User className="w-4 h-4 text-gray-500" />
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {worker.user_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <span className="text-sm text-gray-900 dark:text-white font-medium">
                        {worker.total_tasks}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        {worker.completed_tasks}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                        {worker.in_progress_tasks}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                        {worker.paid_tasks}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <span className="text-sm text-orange-600 dark:text-orange-400 font-medium">
                        {worker.remote_tasks}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <span className="text-sm text-green-600 dark:text-green-400 font-semibold">
                        {formatCurrency(worker.total_earned)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            
            {/* Summary row */}
            {workerStats && workerStats.length > 0 && (
              <tfoot className="bg-gray-100 dark:bg-gray-800/70 font-semibold">
                <tr>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    Итого
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                    {workerStats.reduce((sum, w) => sum + w.total_tasks, 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                    {workerStats.reduce((sum, w) => sum + w.completed_tasks, 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-orange-600 dark:text-orange-400">
                    {workerStats.reduce((sum, w) => sum + w.in_progress_tasks, 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400">
                    {workerStats.reduce((sum, w) => sum + w.paid_tasks, 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-orange-600 dark:text-orange-400">
                    {workerStats.reduce((sum, w) => sum + w.remote_tasks, 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                    {formatCurrency(workerStats.reduce((sum, w) => sum + w.total_earned, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Period Info */}
      <Card className="bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          <Calendar className="w-4 h-4" />
          <span>
            Период: <strong>
              {period === 'all' && 'Всё время'}
              {period === 'month' && 'Последние 30 дней'}
              {period === 'week' && 'Последние 7 дней'}
            </strong>
          </span>
          {selectedUserId && (
            <>
              <span className="text-gray-400">•</span>
              <span>
                Исполнитель: <strong>
                  {workers.find(w => w.id === Number(selectedUserId))?.full_name || 'Выбран'}
                </strong>
              </span>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
