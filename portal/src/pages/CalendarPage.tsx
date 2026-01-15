import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  Plus
} from 'lucide-react'
import Card from '@/components/Card'
import Spinner from '@/components/Spinner'
import StatusBadge from '@/components/StatusBadge'
import PriorityBadge from '@/components/PriorityBadge'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/api/client'
import { Task } from '@/types/task'
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  isToday,
  parseISO
} from 'date-fns'
import { ru } from 'date-fns/locale'

export default function CalendarPage() {
  const { user } = useAuthStore()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const isWorker = user?.role === 'worker'

  const { data, isLoading } = useQuery({
    queryKey: ['calendar-tasks', format(currentDate, 'yyyy-MM'), isWorker ? user?.id : null],
    queryFn: async () => {
      const start = startOfMonth(currentDate)
      const end = endOfMonth(currentDate)
      const params = new URLSearchParams()
      params.append('planned_date_from', format(start, 'yyyy-MM-dd'))
      params.append('planned_date_to', format(end, 'yyyy-MM-dd'))
      if (isWorker && user?.id) {
        params.append('assignee_id', String(user.id))
      }
      params.append('size', '200')
      const response = await apiClient.get<{ items: Task[] }>(`/tasks?${params}`)
      return response.data.items
    },
  })

  const tasks = data ?? []

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Get tasks for a specific day
  const getTasksForDay = (date: Date) => {
    return tasks.filter(task => {
      if (!task.planned_date) return false
      try {
        const taskDate = parseISO(task.planned_date)
        return isSameDay(taskDate, date)
      } catch {
        return false
      }
    })
  }

  // Selected day tasks
  const selectedDayTasks = selectedDate ? getTasksForDay(selectedDate) : []

  const goToPreviousMonth = () => setCurrentDate(subMonths(currentDate, 1))
  const goToNextMonth = () => setCurrentDate(addMonths(currentDate, 1))
  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(new Date())
  }

  // Weekday headers
  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  // Calculate first day offset (Monday = 0)
  const firstDayOffset = (monthStart.getDay() + 6) % 7

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Календарь</h1>
          <p className="text-gray-500 dark:text-gray-400">Планирование заявок по датам</p>
        </div>
        
        {!isWorker && (
          <Link
            to="/tasks/new"
            className="inline-flex items-center px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition font-medium"
          >
            <Plus size={20} className="mr-2" />
            Новая заявка
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          {/* Month Navigation */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <button
              onClick={goToPreviousMonth}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
            >
              <ChevronLeft size={20} />
            </button>
            
            <div className="flex items-center space-x-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                {format(currentDate, 'LLLL yyyy', { locale: ru })}
              </h2>
              <button
                onClick={goToToday}
                className="px-3 py-1 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition"
              >
                Сегодня
              </button>
            </div>
            
            <button
              onClick={goToNextMonth}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Calendar Grid */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : (
            <div className="p-4">
              {/* Weekday Headers */}
              <div className="grid grid-cols-7 mb-2">
                {weekDays.map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells for offset */}
                {Array.from({ length: firstDayOffset }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square" />
                ))}
                
                {/* Day cells */}
                {days.map((day) => {
                  const dayTasks = getTasksForDay(day)
                  const isSelected = selectedDate && isSameDay(day, selectedDate)
                  const isCurrentMonth = isSameMonth(day, currentDate)
                  const isTodayDate = isToday(day)
                  
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`
                        aspect-square p-1 rounded-lg transition relative
                        ${isSelected 
                          ? 'bg-primary-500 text-white' 
                          : isTodayDate
                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                            : isCurrentMonth
                              ? 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white'
                              : 'text-gray-400 dark:text-gray-600'
                        }
                      `}
                    >
                      <span className="text-sm font-medium">{format(day, 'd')}</span>
                      
                      {/* Task indicators */}
                      {dayTasks.length > 0 && (
                        <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex space-x-0.5">
                          {dayTasks.slice(0, 3).map((task) => (
                            <span
                              key={task.id}
                              className={`w-1.5 h-1.5 rounded-full ${
                                isSelected ? 'bg-white/70' :
                                task.status === 'NEW' ? 'bg-red-500' :
                                task.status === 'IN_PROGRESS' ? 'bg-yellow-500' :
                                'bg-green-500'
                              }`}
                            />
                          ))}
                          {dayTasks.length > 3 && (
                            <span className={`text-[8px] ${isSelected ? 'text-white/70' : 'text-gray-500'}`}>
                              +{dayTasks.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </Card>

        {/* Selected Day Tasks */}
        <Card>
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <CalendarIcon size={20} className="mr-2 text-primary-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">
                {selectedDate 
                  ? format(selectedDate, 'd MMMM yyyy', { locale: ru })
                  : 'Выберите дату'
                }
              </h2>
            </div>
          </div>
          
          <div className="p-4">
            {!selectedDate ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                Выберите день в календаре
              </p>
            ) : selectedDayTasks.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                Нет заявок на этот день
              </p>
            ) : (
              <div className="space-y-3">
                {selectedDayTasks.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tasks/${task.id}`}
                    className="block p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <PriorityBadge priority={task.priority} />
                      <StatusBadge status={task.status} />
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {task.title}
                    </p>
                    {task.raw_address && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                        {task.raw_address}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
