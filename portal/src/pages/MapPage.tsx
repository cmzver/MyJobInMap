import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { DivIcon, Icon, LatLngBounds, divIcon } from 'leaflet'
import { 
  Calendar,
  Locate, 
  Filter,
  Navigation,
  Phone,
  User,
  X,
  MapPin
} from 'lucide-react'
import Card from '@/components/Card'
import Spinner from '@/components/Spinner'
import StatusBadge from '@/components/StatusBadge'
import PriorityBadge from '@/components/PriorityBadge'
import { useAuthStore } from '@/store/authStore'
import { useTheme } from '@/hooks/useTheme'
import apiClient from '@/api/client'
import { Task } from '@/types/task'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css'

// Custom marker icons
const lightenColor = (hex: string, factor = 0.25) => {
  if (!hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) return hex
  const full = hex.length === 4
    ? '#' + hex.slice(1).split('').map((c) => c + c).join('')
    : hex
  const num = parseInt(full.slice(1), 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * factor))
  const toHex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`
}

const markerSvg = (color: string) => {
  const start = lightenColor(color, 0.28)
  const gradId = `grad${color.replace(/[^a-zA-Z0-9]/g, '') || 'pin'}`
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">
    <defs>
      <linearGradient id="${gradId}" x1="10%" y1="0%" x2="90%" y2="100%">
        <stop offset="0%" stop-color="${start}" />
        <stop offset="100%" stop-color="${color}" />
      </linearGradient>
      <filter id="${gradId}-shadow" x="0" y="0" width="170%" height="170%">
        <feOffset dy="4" in="SourceAlpha" result="off"/>
        <feGaussianBlur in="off" stdDeviation="4" result="blur"/>
        <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.05 0 0 0 0 0.08 0 0 0 0 0.2 0 0 0 0.18 0" result="shadow"/>
        <feBlend in="SourceGraphic" in2="shadow" mode="normal"/>
      </filter>
    </defs>
    <g filter="url(#${gradId}-shadow)">
      <path d="M20 3.5C11.2 3.5 4 10.6 4 19.3 4 31.2 16.3 43.1 18.9 45.6a1.7 1.7 0 0 0 2.3 0C23 43.1 36 31.2 36 19.3 36 10.6 28.8 3.5 20 3.5Z" fill="url(#${gradId})"/>
      <circle cx="20" cy="19.5" r="8.5" fill="#ffffff" opacity="0.9"/>
      <path d="M17.8 14.5h4.4c.4 0 .8.3.8.8V23c0 .4-.3.8-.8.8h-4.4c-.4 0-.8-.3-.8-.8v-7.7c0-.4.3-.8.8-.8Zm4.8 1.3c0-.2-.2-.4-.4-.4h-2.3c-.3 0-.5-.2-.5-.5v-1c0-.2-.2-.4-.4-.4h-1.2a.4.4 0 0 0-.4.4v1c0 .3.2.5.5.5h2.3c.3 0 .5.2.5.5v1.2c0 .2.2.4.4.4h1.1c.2 0 .4-.2.4-.4v-1.3Zm-4.2 4.4 1.4-1.6c.2-.2.6-.2.8 0l2 2.1c.3.3.3.7 0 1-.3.2-.7.2-1 0l-1.6-1.7-.9 1a.7.7 0 0 1-1 0 .7.7 0 0 1 0-1Zm-1.1-2.4c0-.3.2-.5.5-.5h1c.3 0 .5.2.5.5v.4c0 .3-.2.5-.5.5h-1c-.3 0-.5-.2-.5-.5v-.4Zm0 2c0-.3.2-.5.5-.5h1c.3 0 .5.2.5.5v.4c0 .3-.2.5-.5.5h-1c-.3 0-.5-.2-.5-.5v-.4Z" fill="${color}" />
    </g>
  </svg>
`
}

const createMarkerIcon = (color: string) => new Icon({
  iconUrl: `data:image/svg+xml;base64,${btoa(markerSvg(color))}`,
  iconSize: [40, 48],
  iconAnchor: [20, 42],
  popupAnchor: [0, -32],
})

const markerColors = {
  NEW: '#EF4444',
  IN_PROGRESS: '#F59E0B',
  DONE: '#22C55E',
  CANCELLED: '#6B7280',
}

const markerIcons = {
  NEW: createMarkerIcon(markerColors.NEW),
  IN_PROGRESS: createMarkerIcon(markerColors.IN_PROGRESS),
  DONE: createMarkerIcon(markerColors.DONE),
  CANCELLED: createMarkerIcon(markerColors.CANCELLED),
}

const countIconCache = new Map<string, DivIcon>()
const createCountMarkerIcon = (color: string, count: number) => {
  const cacheKey = `${color}|${count}`
  const cached = countIconCache.get(cacheKey)
  if (cached) return cached

  const html = `
    <div style="position: relative; width: 40px; height: 48px;">
      ${markerSvg(color)}
      <div
        style="
          position: absolute;
          top: -6px;
          right: -6px;
          min-width: 18px;
          height: 18px;
          padding: 0 4px;
          border-radius: 9999px;
          background: #111827;
          color: #fff;
          font-size: 11px;
          line-height: 18px;
          text-align: center;
          box-shadow: 0 6px 12px rgba(0,0,0,0.22);
          border: 2px solid #fff;
        "
      >${count}</div>
    </div>
  `

  const icon = divIcon({
    className: 'task-count-marker',
    html,
    iconSize: [40, 48],
    iconAnchor: [20, 42],
    popupAnchor: [0, -32],
  })
  countIconCache.set(cacheKey, icon)
  return icon
}

const getTaskNumber = (task: Task) => task.task_number || String(task.id)

const getTaskPrimaryTitle = (task: Task) => {
  if (task.defect_type) return task.defect_type
  if (task.title) return task.title
  if (task.description) return task.description
  return 'Без описания'
}

const getTaskSecondaryTitle = (task: Task) => {
  if (task.defect_type && task.title && task.title !== task.defect_type) {
    return task.title
  }
  if (!task.defect_type && task.description && task.description !== task.title) {
    return task.description
  }
  return ''
}

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return '—'
  try {
    return format(new Date(dateStr), 'd MMM yyyy, HH:mm', { locale: ru })
  } catch {
    return dateStr
  }
}

// Component to fit bounds
function FitBounds({ tasks }: { tasks: Task[] }) {
  const map = useMap()
  
  useEffect(() => {
    if (tasks.length > 0) {
      const validTasks = tasks.filter(t => t.lat && t.lon)
      if (validTasks.length > 0) {
        const bounds = new LatLngBounds(
          validTasks.map(t => [t.lat!, t.lon!] as [number, number])
        )
        map.fitBounds(bounds, { padding: [50, 50] })
      }
    }
  }, [tasks, map])
  
  return null
}

// Component for locate user
function LocateControl() {
  const map = useMap()
  
  const handleLocate = () => {
    map.locate({ setView: true, maxZoom: 16 })
  }
  
  return (
      <button
        onClick={handleLocate}
        className="absolute bottom-20 right-4 z-10 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
        title="Моё местоположение"
      >
      <Locate size={20} className="text-gray-700 dark:text-gray-300" />
    </button>
  )
}

export default function MapPage() {
  const { user } = useAuthStore()
  const { resolvedTheme } = useTheme()
  const [statusFilter, setStatusFilter] = useState<string[]>(['NEW', 'IN_PROGRESS'])
  const [showFilters, setShowFilters] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const sortedStatuses = useMemo(() => statusFilter.slice().sort(), [statusFilter])
  const statusQuery = useMemo(() => sortedStatuses.join(','), [sortedStatuses])
  const statusDefs = [
    { value: 'NEW', label: 'Новые', color: '#ef4444' },
    { value: 'IN_PROGRESS', label: 'В работе', color: '#f59e0b' },
  ] as const
  const allStatusesSelected = statusFilter.length === statusDefs.length

  // Filter by assignee for workers
  const isWorker = user?.role === 'worker'

  const { data, isLoading } = useQuery({
    queryKey: ['map-tasks', statusQuery, isWorker ? user?.id : null],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (!allStatusesSelected && sortedStatuses.length === 1) {
        params.append('status', sortedStatuses[0]) // API принимает только один статус
      }
      if (isWorker && user?.id) {
        params.append('assignee_id', String(user.id))
      }
      params.append('size', '200')
      const response = await apiClient.get<{ items: Task[] }>(`/tasks?${params}`)
      const items = response.data.items.filter(t => t.lat && t.lon)
      return items.filter(t => statusFilter.includes(t.status))
    },
  })

  const tasks = data ?? []
  const statusCounts = useMemo(() => {
    return tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1
      return acc
    }, {})
  }, [tasks])
  const filterLabel = statusFilter.length === statusDefs.length
    ? 'Новые + В работе'
    : statusFilter.map(s => statusDefs.find(d => d.value === s)?.label || s).join(', ')
  const groupedTasks = useMemo(() => {
    const groups = new Map<string, { key: string; lat: number; lon: number; latSum: number; lonSum: number; tasks: Task[] }>()

    tasks.forEach((task) => {
      if (task.lat == null || task.lon == null) return
      const key = `coord:${task.lat.toFixed(4)}|${task.lon.toFixed(4)}`
      const existing = groups.get(key)
      if (existing) {
        existing.tasks.push(task)
        existing.latSum += task.lat
        existing.lonSum += task.lon
        existing.lat = existing.latSum / existing.tasks.length
        existing.lon = existing.lonSum / existing.tasks.length
      } else {
        groups.set(key, { key, lat: task.lat, lon: task.lon, latSum: task.lat, lonSum: task.lon, tasks: [task] })
      }
    })

    return Array.from(groups.values())
  }, [tasks])

  const getGroupStatus = (groupTasks: Task[]) => {
    if (groupTasks.some((task) => task.status === 'NEW')) return 'NEW'
    if (groupTasks.some((task) => task.status === 'IN_PROGRESS')) return 'IN_PROGRESS'
    if (groupTasks.some((task) => task.status === 'DONE')) return 'DONE'
    return 'CANCELLED'
  }

  const toggleStatus = (status: string) => {
    setStatusFilter(prev => {
      const has = prev.includes(status)
      if (has && prev.length === 1) return prev // не выключаем последний активный статус
      if (has) return prev.filter(s => s !== status)
      return [...prev, status]
    })
  }

  const defaultCenter: [number, number] = [55.7558, 37.6173] // Moscow
  const openNavigation = (task: Task) => {
    if (task.lat == null || task.lon == null) return
    window.open(`https://yandex.ru/maps/?rtext=~${task.lat},${task.lon}&rtt=auto`, '_blank')
  }
  return (
    <div className="h-[calc(100vh-8rem)] relative isolate">
      {/* Filter Panel */}
      <div className="absolute top-4 left-16 z-[1000] flex flex-col space-y-2 pointer-events-none">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-white/90 dark:bg-gray-800 shadow-2xl border border-white/60 dark:border-gray-700 backdrop-blur-md hover:-translate-y-0.5 transition-all"
        >
          <Filter size={18} className="text-gray-700 dark:text-gray-200" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{filterLabel}</span>
        </button>
        
        {showFilters && (
          <Card className="pointer-events-auto p-4 shadow-2xl rounded-2xl border border-white/60 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl mt-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3 tracking-wide">Фильтры</p>
            <div className="flex flex-col gap-2">
              {statusDefs.map((status) => {
                const checked = statusFilter.includes(status.value)
                return (
                  <label
                    key={status.value}
                    className={`flex items-center justify-between rounded-full px-3 py-2.5 border cursor-pointer transition-all text-sm ${
                      checked
                        ? 'bg-white/95 dark:bg-gray-800/90 shadow-sm border-gray-200 dark:border-gray-600'
                        : 'bg-gray-50 dark:bg-gray-700/60 border-transparent dark:border-gray-700'
                    }`}
                    onClick={() => toggleStatus(status.value)}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: status.color }} />
                      <span className="text-sm text-gray-900 dark:text-gray-50">{status.label}</span>
                    </span>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 min-w-[18px] text-right">
                      {statusCounts[status.value] || 0}
                    </span>
                  </label>
                )
              })}
            </div>
          </Card>
        )}
      </div>

      {/* Task count */}
      <div className="absolute top-4 right-4 z-10 bg-white/95 dark:bg-gray-800/95 rounded-xl shadow-2xl border border-white/60 dark:border-gray-700 px-4 py-2 backdrop-blur-lg">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <MapPin size={16} className="text-gray-500" />
          {tasks.length} заявок на карте
        </span>
      </div>

      {/* Map */}
      {isLoading ? (
        <div className="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <Spinner size="lg" />
        </div>
      ) : (
        <MapContainer
          center={defaultCenter}
          zoom={10}
          className="fw-map h-full w-full rounded-[28px] relative z-0 overflow-hidden border border-white/60 dark:border-gray-700 shadow-2xl"
          style={{ background: '#f3f4f6' }}
        >
          <TileLayer
            key={resolvedTheme === 'dark' ? 'dark-tiles' : 'light-tiles'}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url={
              resolvedTheme === 'dark'
                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            }
          />
          
          <FitBounds tasks={tasks} />
          <LocateControl />
          
          {groupedTasks.map((group) => {
            const primaryTask = group.tasks[0]
            const groupStatus = getGroupStatus(group.tasks) as keyof typeof markerColors
            const icon = group.tasks.length > 1
              ? createCountMarkerIcon(markerColors[groupStatus], group.tasks.length)
              : markerIcons[groupStatus] || markerIcons.NEW
            const isGrouped = group.tasks.length > 1
            const secondaryTitle = getTaskSecondaryTitle(primaryTask)

            return (
              <Marker
                key={group.key}
                position={[group.lat, group.lon]}
                icon={icon}
                eventHandlers={{
                  click: () => setSelectedTask(primaryTask),
                }}
              >
              <Popup className="fw-popup">
                <div className="min-w-[260px] max-w-[320px]">
                  {isGrouped ? (
                    <div className="space-y-3 fw-map-card">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                              В этой точке
                            </p>
                            <p className="text-sm font-semibold text-gray-900">
                              {group.tasks.length} заявок
                            </p>
                          </div>
                          <span className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold bg-orange-100 text-orange-700">
                            В работе
                          </span>
                        </div>
                        {primaryTask.raw_address && (
                          <div className="mt-2 flex items-start gap-2 text-xs text-gray-600">
                            <MapPin size={14} className="text-gray-400 mt-0.5" />
                            <span className="line-clamp-2">{primaryTask.raw_address}</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {group.tasks.map((task) => {
                          const taskSubtitle = getTaskSecondaryTitle(task)
                          const statusColor = markerColors[task.status as keyof typeof markerColors] || markerColors.NEW

                          return (
                            <Link
                              key={task.id}
                              to={`/tasks/${task.id}`}
                              className="block rounded-xl border border-gray-100 px-3 py-2 hover:bg-gray-50 transition shadow-sm"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor }} />
                                  <span className="text-xs font-mono text-gray-500">№{getTaskNumber(task)}</span>
                                </div>
                                <PriorityBadge priority={task.priority} />
                              </div>
                              <div className="mt-1 text-sm font-semibold text-gray-900 line-clamp-2">
                                {getTaskPrimaryTitle(task)}
                              </div>
                              {taskSubtitle && (
                                <div className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                                  {taskSubtitle}
                                </div>
                              )}
                              {task.assigned_user_name && (
                                <div className="mt-1 text-xs text-gray-500">
                                  Исполнитель: {task.assigned_user_name}
                                </div>
                              )}
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 fw-map-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="inline-flex items-center gap-2">
                            <span className="px-3 py-1 rounded-full bg-slate-100 text-xs font-semibold text-gray-800">
                              № {getTaskNumber(primaryTask)}
                            </span>
                            <PriorityBadge priority={primaryTask.priority} />
                            <StatusBadge status={primaryTask.status} />
                          </div>
                          <h3 className="mt-2 text-lg font-semibold text-gray-900 leading-tight">
                            {getTaskPrimaryTitle(primaryTask)}
                          </h3>
                          {secondaryTitle && (
                            <p className="mt-1 text-sm text-gray-600">
                              {secondaryTitle}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2 text-sm text-gray-700">
                        <div className="flex items-start gap-2">
                          <MapPin size={16} className="text-orange-500 mt-0.5" />
                          <span className="leading-snug">
                            {primaryTask.raw_address || 'Адрес не указан'}
                          </span>
                        </div>
                        {primaryTask.assigned_user_name && (
                          <div className="flex items-center gap-2">
                            <User size={16} className="text-amber-500" />
                            <span>Исполнитель: {primaryTask.assigned_user_name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-blue-500" />
                          <span>
                            {primaryTask.planned_date
                              ? `Срок: ${formatDateTime(primaryTask.planned_date)}`
                              : `Создана: ${formatDateTime(primaryTask.created_at)}`}
                          </span>
                        </div>
                        {primaryTask.customer_name && (
                          <div className="flex items-center gap-2">
                            <User size={16} className="text-purple-500" />
                            <span className="line-clamp-1">Клиент: {primaryTask.customer_name}</span>
                          </div>
                        )}
                        {primaryTask.customer_phone && (
                          <div className="flex items-center gap-2">
                            <Phone size={16} className="text-green-500" />
                            <a
                              href={`tel:${primaryTask.customer_phone}`}
                              className="text-primary-600 hover:text-primary-700 font-semibold"
                            >
                              {primaryTask.customer_phone}
                            </a>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => openNavigation(primaryTask)}
                          className="inline-flex items-center justify-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition"
                        >
                          <Navigation size={16} />
                          Маршрут
                        </button>
                        <Link
                          to={`/tasks/${primaryTask.id}`}
                          className="inline-flex items-center justify-center rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white shadow-lg hover:bg-orange-600 transition"
                        >
                          Открыть
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      )}

      {/* Selected Task Panel (Mobile) */}
      {selectedTask && (
        <div className="lg:hidden absolute bottom-0 left-0 right-0 z-10 bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl p-4 animate-in slide-in-from-bottom">
          <button
            onClick={() => setSelectedTask(null)}
            className="absolute top-4 right-4 p-1 text-gray-500 hover:text-gray-700"
          >
            <X size={20} />
          </button>
          
          <div className="flex items-center space-x-2 mb-3">
            <PriorityBadge priority={selectedTask.priority} />
            <StatusBadge status={selectedTask.status} />
          </div>
          
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {selectedTask.title}
          </h3>
          
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {selectedTask.raw_address}
          </p>
          
          <Link
            to={`/tasks/${selectedTask.id}`}
            className="block w-full text-center py-3 bg-primary-500 text-white font-medium rounded-lg hover:bg-primary-600 transition"
          >
            Открыть заявку
          </Link>
        </div>
      )}
    </div>
  )
}
