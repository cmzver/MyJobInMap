import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { DivIcon, Icon, LatLngBounds, divIcon } from 'leaflet'
import {
  Calendar,
  Filter,
  Locate,
  MapPin,
  Navigation,
  Phone,
  User,
  X,
} from 'lucide-react'
import Spinner from '@/components/Spinner'
import StatusBadge from '@/components/StatusBadge'
import PriorityBadge from '@/components/PriorityBadge'
import { useAuthStore } from '@/store/authStore'
import { useTheme } from '@/hooks/useTheme'
import apiClient from '@/api/client'
import { Task } from '@/types/task'
import { normalizeRoleForAccess } from '@/types/user'
import { formatDatePretty } from '@/utils/dateFormat'

import 'leaflet/dist/leaflet.css'

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

const formatDateTime = formatDatePretty
const COORDINATE_PLACEHOLDER_EPSILON = 0.000001
type Coordinates = Pick<Task, 'lat' | 'lon'>

const isFiniteCoordinate = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const hasUsableCoordinates = (task: Coordinates): task is { lat: number; lon: number } => {
  if (!isFiniteCoordinate(task.lat) || !isFiniteCoordinate(task.lon)) return false
  if (task.lat < -90 || task.lat > 90 || task.lon < -180 || task.lon > 180) return false
  if (
    Math.abs(task.lat) < COORDINATE_PLACEHOLDER_EPSILON
    && Math.abs(task.lon) < COORDINATE_PLACEHOLDER_EPSILON
  ) {
    return false
  }
  return true
}

const isTaskWithUsableCoordinates = (task: Task): task is Task & { lat: number; lon: number } =>
  hasUsableCoordinates(task)

function FitBounds({ tasks }: { tasks: Task[] }) {
  const map = useMap()

  useEffect(() => {
    if (tasks.length > 0) {
      const validTasks = tasks.filter(isTaskWithUsableCoordinates)
      if (validTasks.length > 0) {
        const bounds = new LatLngBounds(
          validTasks.map((task) => [task.lat!, task.lon!] as [number, number]),
        )
        map.fitBounds(bounds, {
          paddingTopLeft: [180, 88],
          paddingBottomRight: [56, 56],
        })
      }
    }
  }, [tasks, map])

  return null
}

function LocateControl() {
  const map = useMap()

  const handleLocate = () => {
    map.locate({ setView: true, maxZoom: 16 })
  }

  return (
    <button
      onClick={handleLocate}
      className="absolute bottom-20 right-4 z-10 rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
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
  const isWorker = normalizeRoleForAccess(user?.role) === 'worker'

  const { data, isLoading } = useQuery({
    queryKey: ['map-tasks', statusQuery, isWorker ? user?.id : null],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (!allStatusesSelected && sortedStatuses.length === 1) {
        params.append('status', sortedStatuses[0]!)
      }
      if (isWorker && user?.id) {
        params.append('assignee_id', String(user.id))
      }
      params.append('size', '200')
      const response = await apiClient.get<{ items: Task[] }>(`/tasks?${params}`)
      const items = response.data.items.filter(isTaskWithUsableCoordinates)
      return items.filter((task) => statusFilter.includes(task.status))
    },
  })

  const tasks = useMemo(() => data ?? [], [data])
  const statusCounts = useMemo(() => {
    return tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1
      return acc
    }, {})
  }, [tasks])
  const filterLabel = statusFilter.length === statusDefs.length
    ? 'Новые и в работе'
    : statusFilter.map((status) => statusDefs.find((def) => def.value === status)?.label || status).join(', ')

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, { key: string; lat: number; lon: number; latSum: number; lonSum: number; tasks: Task[] }>()

    tasks.forEach((task) => {
      if (!isTaskWithUsableCoordinates(task)) return
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
    setStatusFilter((prev) => {
      const hasStatus = prev.includes(status)
      if (hasStatus && prev.length === 1) return prev
      if (hasStatus) return prev.filter((item) => item !== status)
      return [...prev, status]
    })
  }

  const defaultCenter: [number, number] = [55.7558, 37.6173]

  const openNavigation = (task: Task) => {
    if (!isTaskWithUsableCoordinates(task)) return
    window.open(`https://yandex.ru/maps/?rtext=~${task.lat},${task.lon}&rtt=auto`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="relative isolate h-[calc(100vh-8rem)]">
      <div className="pointer-events-none absolute left-[4.5rem] top-4 z-[1000] flex max-w-[320px] flex-col gap-2">
        <button
          onClick={() => setShowFilters((prev) => !prev)}
          className="pointer-events-auto flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          <Filter size={18} className="text-gray-700 dark:text-gray-200" />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{filterLabel}</span>
        </button>

        {showFilters && (
          <div className="pointer-events-auto rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-3 text-sm font-medium text-gray-900 dark:text-white">Показывать на карте</p>
            <div className="flex flex-col gap-2">
              {statusDefs.map((status) => {
                const checked = statusFilter.includes(status.value)
                return (
                  <label
                    key={status.value}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                      checked
                        ? 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-700'
                        : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                    }`}
                    onClick={() => toggleStatus(status.value)}
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: status.color }} />
                      <span className="text-sm text-gray-900 dark:text-gray-100">{status.label}</span>
                    </span>
                    <span className="min-w-[18px] text-right text-sm text-gray-500 dark:text-gray-400">
                      {statusCounts[status.value] || 0}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="absolute right-4 top-4 z-10 rounded-lg border border-gray-200 bg-white px-4 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <span className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-100">
          <MapPin size={16} className="text-gray-500" />
          {tasks.length} заявок на карте
        </span>
      </div>

      {isLoading ? (
        <div className="flex h-full items-center justify-center rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
          <Spinner size="lg" />
        </div>
      ) : (
        <MapContainer
          center={defaultCenter}
          zoom={10}
          className="fw-map relative z-0 h-full w-full overflow-hidden rounded-xl border border-gray-200 shadow-sm dark:border-gray-700"
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
            const primaryTask = group.tasks[0]!
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
                      <div className="fw-map-card space-y-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {group.tasks.length} заявок по адресу
                          </p>
                          {primaryTask.raw_address && (
                            <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                              {primaryTask.raw_address}
                            </p>
                          )}
                        </div>

                        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                          {group.tasks.map((task) => {
                            const taskSubtitle = getTaskSecondaryTitle(task)
                            const statusColor = markerColors[task.status as keyof typeof markerColors] || markerColors.NEW

                            return (
                              <Link
                                key={task.id}
                                to={`/tasks/${task.id}`}
                                className="block rounded-lg border border-gray-200 px-3 py-2 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor }} />
                                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">№{getTaskNumber(task)}</span>
                                  </div>
                                  <PriorityBadge priority={task.priority} />
                                </div>
                                <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                                  {getTaskPrimaryTitle(task)}
                                </div>
                                {taskSubtitle && (
                                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                                    {taskSubtitle}
                                  </div>
                                )}
                                {task.assigned_user_name && (
                                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Исполнитель: {task.assigned_user_name}
                                  </div>
                                )}
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="fw-map-card space-y-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">
                              № {getTaskNumber(primaryTask)}
                            </span>
                            <PriorityBadge priority={primaryTask.priority} />
                            <StatusBadge status={primaryTask.status} />
                          </div>
                          <div>
                            <h3 className="text-base font-semibold leading-tight text-gray-900 dark:text-gray-100">
                              {getTaskPrimaryTitle(primaryTask)}
                            </h3>
                            {secondaryTitle && (
                              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{secondaryTitle}</p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                          <div className="flex items-start gap-2">
                            <MapPin size={16} className="mt-0.5 text-gray-400 dark:text-gray-500" />
                            <span className="leading-snug">{primaryTask.raw_address || 'Адрес не указан'}</span>
                          </div>
                          {primaryTask.assigned_user_name && (
                            <div className="flex items-center gap-2">
                              <User size={16} className="text-gray-400 dark:text-gray-500" />
                              <span>Исполнитель: {primaryTask.assigned_user_name}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-gray-400 dark:text-gray-500" />
                            <span>
                              {primaryTask.planned_date
                                ? `Срок: ${formatDateTime(primaryTask.planned_date)}`
                                : `Создана: ${formatDateTime(primaryTask.created_at)}`}
                            </span>
                          </div>
                          {primaryTask.customer_name && (
                            <div className="flex items-center gap-2">
                              <User size={16} className="text-gray-400 dark:text-gray-500" />
                              <span className="line-clamp-1">Клиент: {primaryTask.customer_name}</span>
                            </div>
                          )}
                          {primaryTask.customer_phone && (
                            <div className="flex items-center gap-2">
                              <Phone size={16} className="text-gray-400 dark:text-gray-500" />
                              <a
                                href={`tel:${primaryTask.customer_phone}`}
                                className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
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
                            className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <Navigation size={16} />
                            Маршрут
                          </button>
                          <Link
                            to={`/tasks/${primaryTask.id}`}
                            className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
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

      {selectedTask && (
        <div className="absolute bottom-0 left-0 right-0 z-10 rounded-t-xl border border-gray-200 bg-white p-4 shadow-lg lg:hidden dark:border-gray-700 dark:bg-gray-800">
          <button
            onClick={() => setSelectedTask(null)}
            className="absolute right-4 top-4 p-1 text-gray-500 transition-colors hover:text-gray-700 dark:hover:text-gray-300"
          >
            <X size={20} />
          </button>

          <div className="mb-3 flex items-center gap-2">
            <PriorityBadge priority={selectedTask.priority} />
            <StatusBadge status={selectedTask.status} />
          </div>

          <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
            {getTaskPrimaryTitle(selectedTask)}
          </h3>

          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{selectedTask.raw_address}</p>

          <Link
            to={`/tasks/${selectedTask.id}`}
            className="block w-full rounded-lg bg-gray-900 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
          >
            Открыть заявку
          </Link>
        </div>
      )}
    </div>
  )
}
