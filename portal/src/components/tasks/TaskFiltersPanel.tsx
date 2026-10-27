import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import Button from '@/components/Button'
import MultiSelectFilter from '@/components/MultiSelectFilter'
import Select from '@/components/Select'
import TaskSavedViews from '@/components/tasks/TaskSavedViews'
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '@/config/taskConstants'
import type { TaskPriority, TaskSort, TaskStatus } from '@/types/task'
import type { TaskSavedView, TaskSavedViewSettings } from '@/hooks/useTaskSavedViews'

export interface ActiveTaskFilter {
  id: string
  type: 'search' | 'status' | 'priority' | 'assignee' | 'address'
  label: string
  value: string
  rawValue?: string
}

interface AssignableUserOption {
  id: number
  full_name?: string | null
  username: string
}

interface TaskFilterSummary {
  unassigned: number
  overdue: number
  dueSoon: number
  urgent: number
}

interface TaskFiltersPanelProps {
  searchInput: string
  onSearchChange: (value: string) => void
  onSearchCommit: () => void
  isNewQuickView: boolean
  isInProgressQuickView: boolean
  isUrgentQuickView: boolean
  onToggleQuickStatus: (status: TaskStatus) => void
  onToggleUrgentPriorities: () => void
  showAdvancedFilters: boolean
  advancedFilterCount: number
  onToggleAdvancedFilters: () => void
  savedViews: TaskSavedView[]
  activeSavedViewId: string
  currentSavedViewSettings: TaskSavedViewSettings
  onApplySavedView: (view: TaskSavedView) => void
  onSaveCurrentView: (name: string, settings: TaskSavedViewSettings) => void
  onDeleteSavedView: (view: TaskSavedView) => void
  sortBy: TaskSort
  groupBy: string
  statusFilter: TaskStatus[]
  priorityFilter: TaskPriority[]
  assigneeFilter: string[]
  assignableUsers: AssignableUserOption[]
  onSortChange: (value: string) => void
  onGroupChange: (value: string) => void
  onStatusChange: (values: string[]) => void
  onPriorityChange: (values: string[]) => void
  onAssigneeChange: (values: string[]) => void
  hasActiveFilters: boolean
  activeFilters: ActiveTaskFilter[]
  onClearFilters: () => void
  onClearSingleFilter: (filter: ActiveTaskFilter) => void
  summary?: TaskFilterSummary
}

const groupOptions = [
  { value: '', label: 'Без группировки' },
  { value: 'status', label: 'По статусу' },
  { value: 'assignee', label: 'По исполнителю' },
  { value: 'priority', label: 'По приоритету' },
]

const sortOptions = [
  { value: 'created_at_desc', label: 'Дата заявки: новые сверху' },
  { value: 'created_at_asc', label: 'Дата заявки: старые сверху' },
]

const quickButtonClass = (active: boolean, urgent = false) => `h-9 flex-shrink-0 rounded-md border px-3 text-sm font-medium transition-colors ${
  active
    ? urgent
      ? 'border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300'
      : 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
    : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'
}`

export default function TaskFiltersPanel({
  searchInput,
  onSearchChange,
  onSearchCommit,
  isNewQuickView,
  isInProgressQuickView,
  isUrgentQuickView,
  onToggleQuickStatus,
  onToggleUrgentPriorities,
  showAdvancedFilters,
  advancedFilterCount,
  onToggleAdvancedFilters,
  savedViews,
  activeSavedViewId,
  currentSavedViewSettings,
  onApplySavedView,
  onSaveCurrentView,
  onDeleteSavedView,
  sortBy,
  groupBy,
  statusFilter,
  priorityFilter,
  assigneeFilter,
  assignableUsers,
  onSortChange,
  onGroupChange,
  onStatusChange,
  onPriorityChange,
  onAssigneeChange,
  hasActiveFilters,
  activeFilters,
  onClearFilters,
  onClearSingleFilter,
  summary,
}: TaskFiltersPanelProps) {
  return (
    <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1 lg:max-w-[420px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                aria-label="Поиск заявок"
                placeholder="Номер, адрес, клиент"
                value={searchInput}
                onChange={(event) => onSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onSearchCommit()
                  }
                }}
                className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500"
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
            <button type="button" aria-pressed={isNewQuickView} onClick={() => onToggleQuickStatus('NEW')} className={quickButtonClass(isNewQuickView)}>
              Новые
            </button>
            <button type="button" aria-pressed={isInProgressQuickView} onClick={() => onToggleQuickStatus('IN_PROGRESS')} className={quickButtonClass(isInProgressQuickView)}>
              В работе
            </button>
            <button type="button" aria-pressed={isUrgentQuickView} onClick={onToggleUrgentPriorities} className={quickButtonClass(isUrgentQuickView, true)}>
              Срочные
            </button>
          </div>

          <button
            type="button"
            aria-expanded={showAdvancedFilters}
            aria-controls="task-advanced-filters"
            onClick={onToggleAdvancedFilters}
            className="flex h-9 flex-shrink-0 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Фильтры
              {advancedFilterCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary-100 px-1.5 text-xs font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                  {advancedFilterCount}
                </span>
              )}
            </span>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <TaskSavedViews
          views={savedViews}
          activeViewId={activeSavedViewId}
          currentSettings={currentSavedViewSettings}
          onApply={onApplySavedView}
          onSave={onSaveCurrentView}
          onDelete={onDeleteSavedView}
        />

        <div
          id="task-advanced-filters"
          className={`gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2 xl:grid-cols-5 dark:border-gray-700 ${showAdvancedFilters ? 'grid' : 'hidden'}`}
        >
          <Select label="Сортировка" options={sortOptions} value={sortBy} onChange={onSortChange} placeholder="Сортировка" className="h-9 text-sm" />
          <Select label="Группировка" options={groupOptions} value={groupBy} onChange={onGroupChange} placeholder="Без группировки" className="h-9 text-sm" />
          <MultiSelectFilter label="Статусы" options={[...STATUS_OPTIONS]} selectedValues={statusFilter} onChange={onStatusChange} placeholder="Все статусы" />
          <MultiSelectFilter label="Приоритеты" options={[...PRIORITY_OPTIONS]} selectedValues={priorityFilter} onChange={onPriorityChange} placeholder="Все приоритеты" />
          <MultiSelectFilter
            label="Исполнители"
            options={assignableUsers.map((user) => ({ value: String(user.id), label: user.full_name || user.username }))}
            selectedValues={assigneeFilter}
            onChange={onAssigneeChange}
            placeholder="Все исполнители"
          />
          <div className="flex items-end sm:col-span-2 xl:col-span-5 xl:justify-end">
            <Button variant="ghost" size="sm" onClick={onClearFilters} disabled={!hasActiveFilters} className="h-9 px-3">
              Сбросить фильтры
            </Button>
          </div>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {activeFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => onClearSingleFilter(filter)}
              className="flex h-8 items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <span className="text-gray-500 dark:text-gray-400">{filter.label}:</span>
              <span className="max-w-[180px] truncate text-gray-900 dark:text-white">{filter.value}</span>
              <X size={12} className="text-gray-400" />
            </button>
          ))}
        </div>
      )}

      {summary && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3 dark:border-gray-800">
          <span className="eyebrow mr-1">Сводка</span>
          {[
            { label: 'Без исполнителя', value: summary.unassigned, active: false },
            { label: 'Просроченные', value: summary.overdue, active: summary.overdue > 0, tone: 'red' as const },
            { label: 'Срок < 24ч', value: summary.dueSoon, active: summary.dueSoon > 0, tone: 'amber' as const },
            { label: 'Срочные', value: summary.urgent, active: summary.urgent > 0, tone: 'orange' as const },
          ].map((item) => (
            <span
              key={item.label}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${
                item.active && item.tone === 'red'
                  ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                  : item.active && item.tone === 'amber'
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
                    : item.active && item.tone === 'orange'
                      ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300'
                      : 'bg-gray-50 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400'
              }`}
            >
              {item.label}
              <span className="font-semibold">{item.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
