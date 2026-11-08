import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { DivIcon, Icon, LatLngBounds, divIcon, type Map as LeafletMap } from 'leaflet'
import toast from 'react-hot-toast'
import {
  Calendar,
  Check,
  Filter,
  List,
  Locate,
  Maximize2,
  MapPin,
  Navigation,
  Phone,
  User,
} from 'lucide-react'
import QueryStatePanel from '@/components/QueryStatePanel'
import StatusBadge from '@/components/StatusBadge'
import PriorityBadge from '@/components/PriorityBadge'
import Select from '@/components/Select'
import { useAuthStore } from '@/store/authStore'
import { useTheme } from '@/hooks/useTheme'
import { useUsers } from '@/hooks/useUsers'
import { fetchAllTaskPages } from '@/api/tasks'
import type { Task, TaskPriority, TaskStatus } from '@/types/task'
import { normalizeRoleForAccess, isAssignableRole } from '@/types/user'
import { STATUS_HEX, STATUS_LABELS, normalizePriority } from '@/config/taskConstants'
import { EMERGENCY_MARKER_HEX, getMarkerColor } from '@/utils/mapMarkerColor'
import { formatDatePretty } from '@/utils/dateFormat'
import { buildTaskListUrl } from '@/utils/taskListUrl'

import 'leaflet/dist/leaflet.css'
import { countRu, pluralRu } from '@/utils/plural'

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

const markerColors = STATUS_HEX

// Маркеры красятся по СТАТУСУ (как в Android), открытая аварийная — красным.
type PriorityKey = 'EMERGENCY' | 'URGENT' | 'CURRENT' | 'PLANNED'

const priorityLegend: { value: PriorityKey; label: string }[] = [
  { value: 'EMERGENCY', label: 'Аварийная' },
  { value: 'URGENT', label: 'Срочная' },
  { value: 'CURRENT', label: 'Текущая' },
  { value: 'PLANNED', label: 'Плановая' },
]

const statusLegend: { value: TaskStatus; label: string }[] = [
  { value: 'NEW', label: STATUS_LABELS.NEW },
  { value: 'IN_PROGRESS', label: STATUS_LABELS.IN_PROGRESS },
  { value: 'DONE', label: STATUS_LABELS.DONE },
  { value: 'CANCELLED', label: STATUS_LABELS.CANCELLED },
]

const markerIconCache = new Map<string, Icon>()
const getMarkerIcon = (color: string) => {
  let icon = markerIconCache.get(color)
  if (!icon) {
    icon = createMarkerIcon(color)
    markerIconCache.set(color, icon)
  }
  return icon
}

/** Точка «моё местоположение» — нейтральная, чтобы не путать с «Новой». */
const MY_POSITION_HEX = '#111827'

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

// Санкт-Петербург — основной регион работы; карта открывается здесь, пока
// не пришли заявки
const DEFAULT_CENTER: [number, number] = [59.9386, 30.3141]
const SINGLE_TASK_ZOOM = 16
const MAP_PADDING = {
  paddingTopLeft: [180, 88] as [number, number],
  paddingBottomRight: [56, 56] as [number, number],
}

const fitToTasks = (map: LeafletMap, tasks: Task[]) => {
  const points = tasks
    .filter(isTaskWithUsableCoordinates)
    .map((task) => [task.lat, task.lon] as [number, number])
  if (points.length === 0) return
  const bounds = new LatLngBounds(points)
  // Одна точка (или все в одном доме): fitBounds приблизил бы до предела
  if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
    map.setView(bounds.getCenter(), SINGLE_TASK_ZOOM)
    return
  }
  map.fitBounds(bounds, { ...MAP_PADDING, maxZoom: SINGLE_TASK_ZOOM })
}

function FitBounds({ tasks }: { tasks: Task[] }) {
  const map = useMap()
  // Фитим границы только один раз — при первой загрузке заявок, чтобы
  // рефетч или смена фильтра не сбрасывали выбранный пользователем зум.
  // Вернуться ко всем заявкам — кнопка «Показать все».
  const hasFitted = useRef(false)

  useEffect(() => {
    if (hasFitted.current || tasks.length === 0) return
    fitToTasks(map, tasks)
    hasFitted.current = true
  }, [tasks, map])

  return null
}

function ZoomWatcher({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  })
  return null
}

const mapButtonClass =
  'rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'

/**
 * Кнопки поверх карты. z-[1000]: панели Leaflet лежат на z-index 400–700,
 * и кнопка с z-10 пряталась под тайлами.
 */
function MapControls({ tasks }: { tasks: Task[] }) {
  const map = useMap()
  const [myPosition, setMyPosition] = useState<[number, number] | null>(null)

  useMapEvents({
    locationfound: (event) => setMyPosition([event.latlng.lat, event.latlng.lng]),
    locationerror: () => {
      toast.error('Не удалось определить местоположение — разрешите доступ к геопозиции в браузере')
    },
  })

  return (
    <>
      {myPosition && (
        <CircleMarker
          center={myPosition}
          radius={8}
          pathOptions={{ color: '#ffffff', weight: 3, fillColor: MY_POSITION_HEX, fillOpacity: 1 }}
        />
      )}
      <div className="absolute bottom-8 right-3 z-[1000] flex flex-col gap-2">
        <button
          type="button"
          onClick={() => fitToTasks(map, tasks)}
          className={mapButtonClass}
          title="Показать все заявки"
          aria-label="Показать все заявки"
        >
          <Maximize2 size={18} className="text-gray-700 dark:text-gray-300" />
        </button>
        <button
          type="button"
          onClick={() => map.locate({ setView: true, maxZoom: SINGLE_TASK_ZOOM })}
          className={mapButtonClass}
          title="Моё местоположение"
          aria-label="Моё местоположение"
        >
          <Locate size={18} className="text-gray-700 dark:text-gray-300" />
        </button>
      </div>
    </>
  )
}

type MarkerGroup = { key: string; lat: number; lon: number; tasks: Task[] }

const DEFAULT_STATUSES: TaskStatus[] = ['NEW', 'IN_PROGRESS']

/**
 * Строка фильтра: точка цвета, подпись, число и галочка у выбранной.
 * Без рамки у каждой строки — как пункты меню.
 */
function FilterOption({
  label,
  color,
  selected,
  count,
  onClick,
}: {
  label: string
  /** Без цвета — нейтральная строка (приоритет не красит маркеры). */
  color?: string
  selected: boolean
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={selected}
      onClick={onClick}
      className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/60 ${
        selected ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
      }`}
    >
      {color && (
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${selected ? '' : 'opacity-40'}`}
          style={{ background: color }}
        />
      )}
      <span className="flex-1 truncate">{label}</span>
      {/* Невыбранные не загружаются — их «0» вводил бы в заблуждение */}
      {selected && <span className="tabular-nums text-xs text-gray-400 dark:text-gray-500">{count}</span>}
      <Check size={14} className={selected ? 'text-primary-500' : 'invisible'} />
    </button>
  )
}

const CLOSED_STATUSES = new Set<string>(['DONE', 'CANCELLED'])
const isClosed = (task: Task) => CLOSED_STATUSES.has(task.status)
// Закрытые заявки — бледнее: в первую очередь глаз должен цеплять живые
const CLOSED_MARKER_OPACITY = 0.5

// Все заявки группы в одном доме (а не просто рядом на мелком масштабе)
const isSameSpot = (group: MarkerGroup) => {
  const spot = (task: Task) => `${task.lat!.toFixed(5)}|${task.lon!.toFixed(5)}`
  const first = spot(group.tasks[0]!)
  return group.tasks.every((task) => spot(task) === first)
}

/** Группа заявок в разных домах: клик приближает, а не открывает список. */
function ZoomToGroupMarker({
  group,
  icon,
  title,
  opacity,
}: {
  group: MarkerGroup
  icon: DivIcon
  title: string
  opacity: number
}) {
  const map = useMap()
  return (
    <Marker
      position={[group.lat, group.lon]}
      icon={icon}
      title={title}
      opacity={opacity}
      eventHandlers={{
        click: () => fitToTasks(map, group.tasks),
      }}
    />
  )
}

export default function MapPage() {
  const { user } = useAuthStore()
  const { resolvedTheme } = useTheme()
  const [statusFilter, setStatusFilter] = useState<TaskStatus[]>([...DEFAULT_STATUSES])
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority[]>([])
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)
  const [zoom, setZoom] = useState(10)
  const sortedStatuses = useMemo(() => statusFilter.slice().sort(), [statusFilter])
  const statusQuery = useMemo(() => sortedStatuses.join(','), [sortedStatuses])
  const sortedPriorities = useMemo(() => priorityFilter.slice().sort(), [priorityFilter])
  const priorityQuery = useMemo(() => sortedPriorities.join(','), [sortedPriorities])
  const statusDefs = [
    { value: 'NEW', label: 'Новые', color: markerColors.NEW },
    { value: 'IN_PROGRESS', label: 'В работе', color: markerColors.IN_PROGRESS },
    { value: 'DONE', label: 'Выполненные', color: markerColors.DONE },
    { value: 'CANCELLED', label: 'Отменённые', color: markerColors.CANCELLED },
  ] as const
  const isWorker = normalizeRoleForAccess(user?.role, user?.baseAccess) === 'worker'
  const { data: users = [] } = useUsers()
  const assignableUsers = useMemo(
    () => users.filter((candidate) => candidate.is_active && isAssignableRole(candidate.role)),
    [users],
  )
  const taskListUrl = isWorker
    ? '/my-tasks'
    : buildTaskListUrl({
        statuses: sortedStatuses,
        priorities: sortedPriorities,
        assigneeIds: assigneeFilter ? [Number(assigneeFilter)] : undefined,
      })

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['tasks', 'map', statusQuery, priorityQuery, isWorker ? user?.id : assigneeFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      // Явно фильтруем по статусам/приоритету/исполнителю на сервере, а не на
      // клиенте, иначе лимит страницы «съедали» бы заявки других статусов.
      sortedStatuses.forEach((status) => params.append('status', status))
      sortedPriorities.forEach((priority) => params.append('priority', priority))
      if (isWorker && user?.id) {
        params.append('assignee_id', String(user.id))
      } else if (assigneeFilter) {
        params.append('assignee_id', assigneeFilter)
      }
      const items = await fetchAllTaskPages(params)
      const located = items.filter(isTaskWithUsableCoordinates)
      return { tasks: located, withoutPoint: items.length - located.length }
    },
  })

  const tasks = useMemo(() => data?.tasks ?? [], [data])
  const withoutPoint = data?.withoutPoint ?? 0
  const statusCounts = useMemo(() => {
    return tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1
      return acc
    }, {})
  }, [tasks])
  const priorityCounts = useMemo(() => {
    return tasks.reduce<Record<string, number>>((acc, task) => {
      const priority = normalizePriority(task.priority)
      acc[priority] = (acc[priority] || 0) + 1
      return acc
    }, {})
  }, [tasks])
  // Сколько фильтров отличается от умолчания (новые + в работе, все приоритеты)
  const isDefaultStatuses =
    sortedStatuses.length === DEFAULT_STATUSES.length && DEFAULT_STATUSES.every((status) => statusFilter.includes(status))
  const changedFilterCount = (isDefaultStatuses ? 0 : 1) + (priorityFilter.length > 0 ? 1 : 0) + (assigneeFilter ? 1 : 0)
  const resetFilters = () => {
    setStatusFilter([...DEFAULT_STATUSES])
    setPriorityFilter([])
    setAssigneeFilter('')
  }

  const groupedTasks = useMemo(() => {
    // Размер ячейки кластеризации зависит от зума: на мелком масштабе
    // близкие заявки объединяются в один маркер-счётчик, при приближении —
    // расходятся. Так маркеры не накладываются друг на друга в центре города.
    const CLUSTER_RADIUS_PX = 64
    const TILE_SIZE_PX = 256
    const cell = (360 / Math.pow(2, zoom)) * (CLUSTER_RADIUS_PX / TILE_SIZE_PX)
    const cellKey = (value: number) => Math.round(value / cell)

    const groups = new Map<string, MarkerGroup & { latSum: number; lonSum: number }>()

    tasks.forEach((task) => {
      if (!isTaskWithUsableCoordinates(task)) return
      const key = `${cellKey(task.lat)}|${cellKey(task.lon)}`
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
  }, [tasks, zoom])

  const toggleStatus = (status: TaskStatus) => {
    setStatusFilter((prev) => {
      const hasStatus = prev.includes(status)
      if (hasStatus && prev.length === 1) return prev
      if (hasStatus) return prev.filter((item) => item !== status)
      return [...prev, status]
    })
  }

  // Приоритет: пустой выбор = все. Снять галочку при «все» — оставить
  // остальные; отметить последний — снова «все».
  const togglePriority = (priority: TaskPriority) => {
    setPriorityFilter((prev) => {
      const all = priorityLegend.map((item) => item.value as TaskPriority)
      const current = prev.length === 0 ? all : prev
      const next = current.includes(priority)
        ? current.filter((item) => item !== priority)
        : [...current, priority]
      if (next.length === 0) return prev
      return next.length === all.length ? [] : next
    })
  }

  // Панель фильтров закрывается кликом мимо неё и по Escape
  const filterAreaRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showFilters) return
    const onPointerDown = (event: MouseEvent) => {
      if (!filterAreaRef.current?.contains(event.target as Node)) setShowFilters(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowFilters(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showFilters])

  const openNavigation = (task: Task) => {
    if (!isTaskWithUsableCoordinates(task)) return
    window.open(`https://yandex.ru/maps/?rtext=~${task.lat},${task.lon}&rtt=auto`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="relative isolate h-[calc(100vh-8rem)] h-[calc(100dvh-8rem)]">
      {/* Всё управление картой — одной панелью справа: сколько на карте,
          фильтры (раскрываются под ней), переход к списку */}
      <div ref={filterAreaRef} className="absolute right-4 top-4 z-[1000] flex flex-col items-end gap-2">
        <div className="flex items-center rounded-lg border border-gray-200 bg-white text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <span
            className="flex items-center gap-2 px-3 py-2 font-medium text-gray-800 dark:text-gray-100"
            title={
              withoutPoint > 0
                ? `Ещё ${countRu(withoutPoint, 'заявка', 'заявки', 'заявок')} без точки на карте — адрес не найден`
                : undefined
            }
          >
            <MapPin size={16} className="text-gray-500" />
            {tasks.length}
            <span className="hidden sm:inline">
              {pluralRu(tasks.length, 'заявка', 'заявки', 'заявок')} на карте
              {withoutPoint > 0 && (
                <span className="font-normal text-gray-500 dark:text-gray-400"> · {withoutPoint} без точки</span>
              )}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            aria-expanded={showFilters}
            className={`flex items-center gap-2 border-l border-gray-200 px-3 py-2 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 dark:border-gray-700 ${
              showFilters
                ? 'bg-gray-50 text-gray-900 dark:bg-gray-700 dark:text-white'
                : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Filter size={16} />
            <span className="hidden sm:inline">Фильтры</span>
            {changedFilterCount > 0 && (
              <span className="rounded-full bg-primary-500 px-1.5 text-[11px] font-semibold leading-[18px] text-white">
                {changedFilterCount}
              </span>
            )}
          </button>
          <Link
            to={taskListUrl}
            className="flex items-center gap-2 border-l border-gray-200 px-3 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
            aria-label={isWorker ? 'Открыть мои заявки списком' : 'Открыть отфильтрованные заявки списком'}
          >
            <List size={16} />
            <span className="hidden sm:inline">Список</span>
          </Link>
        </div>

        {showFilters && (
          <div className="max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <div className="p-2">
              <p className="eyebrow px-2 pb-1 pt-1">Статус</p>
              {statusDefs.map((status) => (
                <FilterOption
                  key={status.value}
                  label={status.label}
                  color={status.color}
                  selected={statusFilter.includes(status.value)}
                  count={statusCounts[status.value] || 0}
                  onClick={() => toggleStatus(status.value)}
                />
              ))}
            </div>
            <div className="border-t border-gray-100 p-2 dark:border-gray-700">
              <p className="eyebrow px-2 pb-1 pt-1">Приоритет</p>
              {priorityLegend.map((item) => (
                <FilterOption
                  key={item.value}
                  label={item.label}
                  // Пустой выбор приоритетов — «все»: отмечены все строки
                  selected={priorityFilter.length === 0 || priorityFilter.includes(item.value)}
                  count={priorityCounts[item.value] || 0}
                  onClick={() => togglePriority(item.value)}
                />
              ))}
            </div>
            {!isWorker && (
              <div className="border-t border-gray-100 p-3 dark:border-gray-700">
                <p className="eyebrow pb-1.5">Исполнитель</p>
                <Select
                  options={[
                    { value: '', label: 'Все исполнители' },
                    ...assignableUsers.map((candidate) => ({
                      value: String(candidate.id),
                      label: candidate.full_name || candidate.username,
                    })),
                  ]}
                  value={assigneeFilter}
                  onChange={setAssigneeFilter}
                  placeholder="Все исполнители"
                  className="h-9 text-sm"
                />
              </div>
            )}
            {changedFilterCount > 0 && (
              <div className="border-t border-gray-100 px-4 py-2 dark:border-gray-700">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
                >
                  Сбросить фильтры
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800/95">
        <p className="eyebrow mb-1.5">Статус</p>
        <div className="flex flex-col gap-1">
          {statusLegend.map((item) => (
            <span key={item.value} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_HEX[item.value] }} />
              {item.label}
            </span>
          ))}
          <span className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: EMERGENCY_MARKER_HEX }} />
            Аварийная
          </span>
          {statusFilter.some((status) => CLOSED_STATUSES.has(status)) && (
            <span className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Бледные — закрытые</span>
          )}
        </div>
      </div>

      {isLoading ? (
        <QueryStatePanel
          state="loading"
          title="Загружаем заявки на карте"
          className="h-full min-h-0 rounded-xl bg-gray-100 dark:bg-gray-800"
        />
      ) : error && !data ? (
        <QueryStatePanel
          state="error"
          icon={MapPin}
          title="Не удалось загрузить карту заявок"
          description="Данные карты недоступны. Проверьте подключение и попробуйте ещё раз."
          onRetry={refetch}
          isRetrying={isFetching}
          className="h-full min-h-0 rounded-xl bg-gray-100 dark:bg-gray-800"
        />
      ) : tasks.length === 0 ? (
        <QueryStatePanel
          state="empty"
          icon={MapPin}
          title="На карте нет заявок"
          description="По выбранным фильтрам нет заявок с координатами. Измените фильтры или откройте список."
          className="h-full min-h-0 rounded-xl bg-gray-100 dark:bg-gray-800"
        />
      ) : (
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={10}
          className="fw-map relative z-0 h-full w-full overflow-hidden rounded-xl border border-gray-200 shadow-sm dark:border-gray-700"
          style={{ background: resolvedTheme === 'dark' ? '#1f2937' : '#f3f4f6' }}
        >
          {/* Тёмная подложка CARTO теперь требует ключ (вместо улиц — «API KEY
              REQUIRED»); в тёмной теме — те же тайлы OSM, затемнённые фильтром */}
          <TileLayer
            key={resolvedTheme === 'dark' ? 'dark-tiles' : 'light-tiles'}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            className={resolvedTheme === 'dark' ? 'fw-tiles-dark' : undefined}
          />

          <FitBounds tasks={tasks} />
          <ZoomWatcher onZoomChange={setZoom} />
          <MapControls tasks={tasks} />

          {groupedTasks.map((group) => {
            const primaryTask = group.tasks[0]!
            const groupColor = getMarkerColor(group.tasks)
            const icon = group.tasks.length > 1
              ? createCountMarkerIcon(groupColor, group.tasks.length)
              : getMarkerIcon(groupColor)
            const isGrouped = group.tasks.length > 1
            const secondaryTitle = getTaskSecondaryTitle(primaryTask)
            const opacity = group.tasks.every(isClosed) ? CLOSED_MARKER_OPACITY : 1

            if (isGrouped && !isSameSpot(group)) {
              return (
                <ZoomToGroupMarker
                  key={group.key}
                  group={group}
                  icon={icon as DivIcon}
                  opacity={opacity}
                  title={`${countRu(group.tasks.length, 'заявка', 'заявки', 'заявок')} рядом — нажмите, чтобы приблизить`}
                />
              )
            }

            return (
              <Marker
                key={group.key}
                position={[group.lat, group.lon]}
                icon={icon}
                opacity={opacity}
                title={
                  isGrouped
                    ? `${countRu(group.tasks.length, 'заявка', 'заявки', 'заявок')}: ${primaryTask.raw_address || 'адрес не указан'}`
                    : `№${getTaskNumber(primaryTask)} · ${getTaskPrimaryTitle(primaryTask)}`
                }
              >
                <Popup className="fw-popup">
                  <div className="min-w-[260px] max-w-[320px]">
                    {isGrouped ? (
                      <div className="fw-map-card space-y-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {countRu(group.tasks.length, 'заявка', 'заявки', 'заявок')} по адресу
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
                                ? `План: ${formatDateTime(primaryTask.planned_date)}`
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

    </div>
  )
}
