/**
 * ReportsPage - Analytics and Statistics
 * Features: period filters, charts, worker stats, export
 */

import { useState } from 'react'
import { 
  BarChart3, 
  Download, 
  Calendar, 
  Filter,
  TrendingUp,
  Clock,
  Users,
  CheckCircle,
  AlertCircle,
  Activity
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useReports, downloadReport } from '@/hooks/useReports'
import { useUsers } from '@/hooks/useUsers'
import type { ReportPeriod } from '@/types/reports'
import Card from '@/components/Card'
import Button from '@/components/Button'
import Select from '@/components/Select'
import Spinner from '@/components/Spinner'
import EmptyState from '@/components/EmptyState'

const periodOptions = [
  { value: 'today', label: 'Сегодня' },
  { value: 'yesterday', label: 'Вчера' },
  { value: 'week', label: 'Эта неделя' },
  { value: 'month', label: 'Этот месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
  { value: 'all', label: 'Всё время' },
]

const statusColors: Record<string, string> = {
  NEW: '#EF4444',
  IN_PROGRESS: '#F59E0B',
  DONE: '#22C55E',
  CANCELLED: '#6B7280',
}

const priorityColors: Record<string, string> = {
  EMERGENCY: '#DC2626',
  URGENT: '#F59E0B',
  CURRENT: '#3B82F6',
  PLANNED: '#22C55E',
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>('month')
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('')

  const { data: users = [] } = useUsers()
  const workers = users.filter(u => u.role === 'worker' || u.role === 'dispatcher')

  const { data, isLoading, refetch, isFetching } = useReports({
    period,
    worker_id: selectedWorkerId ? Number(selectedWorkerId) : undefined,
  })

  const handleExport = () => {
    try {
      downloadReport({ period })
      toast.success('Отчёт экспортируется...')
    } catch (error) {
      toast.error('Ошибка экспорта отчёта')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!data) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Нет данных"
        description="Не удалось загрузить отчёт"
      />
    )
  }

  const { summary, by_status, by_priority, by_day, by_worker, completion_time } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Отчёты и аналитика</h1>
          <p className="text-gray-500 dark:text-gray-400">Статистика и данные по заявкам</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <Activity className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
          >
            <Download className="w-4 h-4" />
            Экспорт CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Период:</span>
          </div>
          <Select
            value={period}
            onChange={(value) => setPeriod(value as ReportPeriod)}
            options={periodOptions}
            className="w-48"
          />
          
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Работник:</span>
          </div>
          <Select
            value={selectedWorkerId}
            onChange={(value) => setSelectedWorkerId(value)}
            options={[
              { value: '', label: 'Все работники' },
              ...workers.map(w => ({
                value: String(w.id),
                label: w.full_name || w.username
              }))
            ]}
            className="w-56"
          />
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Всего заявок</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                {summary.total_tasks}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                За {summary.period_days} {summary.period_days === 1 ? 'день' : 'дней'}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Выполнено</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">
                {summary.completed_tasks}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {summary.completion_rate}% от всех
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">В среднем за день</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                {summary.avg_tasks_per_day}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                заявок создано
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Среднее время</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                {completion_time ? `${completion_time.avg_hours}ч` : '—'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                на выполнение
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Clock className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Распределение по статусам
          </h3>
          <div className="space-y-3">
            {by_status.map((item) => {
              const percentage = summary.total_tasks > 0 
                ? (item.count / summary.total_tasks * 100).toFixed(1)
                : '0'
              
              return (
                <div key={item.status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {item.label}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {item.count} ({percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${percentage}%`,
                        backgroundColor: statusColors[item.status] || '#6B7280'
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Priority Distribution */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Распределение по приоритетам
          </h3>
          <div className="space-y-3">
            {by_priority.map((item) => {
              const percentage = summary.total_tasks > 0 
                ? (item.count / summary.total_tasks * 100).toFixed(1)
                : '0'
              
              return (
                <div key={item.priority}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {item.label}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {item.count} ({percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${percentage}%`,
                        backgroundColor: priorityColors[item.priority] || '#6B7280'
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Daily Activity Chart */}
      {by_day.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Динамика по дням
          </h3>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Simple bar chart */}
              <div className="space-y-2">
                {by_day.slice(-14).map((item) => {
                  const maxValue = Math.max(...by_day.map(d => Math.max(d.created, d.completed)))
                  const createdWidth = maxValue > 0 ? (item.created / maxValue * 100) : 0
                  const completedWidth = maxValue > 0 ? (item.completed / maxValue * 100) : 0
                  
                  return (
                    <div key={item.date} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">
                        {new Date(item.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                      </span>
                      <div className="flex-1 flex gap-1">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div 
                              className="h-6 bg-blue-500 rounded transition-all"
                              style={{ width: `${createdWidth}%` }}
                              title={`Создано: ${item.created}`}
                            />
                            <span className="text-xs text-gray-600 dark:text-gray-400 w-6">
                              {item.created}
                            </span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div 
                              className="h-6 bg-green-500 rounded transition-all"
                              style={{ width: `${completedWidth}%` }}
                              title={`Выполнено: ${item.completed}`}
                            />
                            <span className="text-xs text-gray-600 dark:text-gray-400 w-6">
                              {item.completed}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-4 mt-4 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded" />
                  <span>Создано</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded" />
                  <span>Выполнено</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Worker Stats Table */}
      {by_worker.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Статистика по исполнителям
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Исполнитель
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Всего
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Новые
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    В работе
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Выполнено
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    % выполнения
                  </th>
                </tr>
              </thead>
              <tbody>
                {by_worker.map((worker) => {
                  const completionRate = worker.total > 0 
                    ? ((worker.completed / worker.total) * 100).toFixed(1)
                    : '0'
                  
                  return (
                    <tr 
                      key={worker.user_id}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">
                        {worker.user_name}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white font-semibold">
                        {worker.total}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-gray-600 dark:text-gray-400">
                        {worker.new_tasks}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-gray-600 dark:text-gray-400">
                        {worker.in_progress}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-green-600 dark:text-green-400 font-semibold">
                        {worker.completed}
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">
                        {completionRate}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Completion Time Stats */}
      {completion_time && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Время выполнения заявок
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Среднее</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {completion_time.avg_hours}ч
              </p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Минимум</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                {completion_time.min_hours}ч
              </p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Максимум</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                {completion_time.max_hours}ч
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
