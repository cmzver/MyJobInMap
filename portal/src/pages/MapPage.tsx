import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { Icon, LatLngBounds } from 'leaflet'
import { 
  Locate, 
  Filter,
  X,
  MapPin
} from 'lucide-react'
import Card from '@/components/Card'
import Spinner from '@/components/Spinner'
import StatusBadge from '@/components/StatusBadge'
import PriorityBadge from '@/components/PriorityBadge'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/api/client'
import { Task } from '@/types/task'

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css'

// Custom marker icons
const createMarkerIcon = (color: string) => new Icon({
  iconUrl: `data:image/svg+xml;base64,${btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="32" height="32">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  `)}`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
})

const markerIcons = {
  NEW: createMarkerIcon('#EF4444'),
  IN_PROGRESS: createMarkerIcon('#F59E0B'),
  DONE: createMarkerIcon('#22C55E'),
  CANCELLED: createMarkerIcon('#6B7280'),
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
      className="absolute bottom-20 right-4 z-[1000] p-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
      title="Моё местоположение"
    >
      <Locate size={20} className="text-gray-700 dark:text-gray-300" />
    </button>
  )
}

export default function MapPage() {
  const { user } = useAuthStore()
  const [statusFilter, setStatusFilter] = useState<string[]>(['NEW', 'IN_PROGRESS'])
  const [showFilters, setShowFilters] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  // Filter by assignee for workers
  const isWorker = user?.role === 'worker'

  const { data, isLoading } = useQuery({
    queryKey: ['map-tasks', statusFilter, isWorker ? user?.id : null],
    queryFn: async () => {
      const params = new URLSearchParams()
      statusFilter.forEach(s => params.append('status', s))
      if (isWorker && user?.id) {
        params.append('assignee_id', String(user.id))
      }
      params.append('size', '200')
      const response = await apiClient.get<{ items: Task[] }>(`/tasks?${params}`)
      return response.data.items.filter(t => t.lat && t.lon)
    },
  })

  const tasks = data ?? []

  const toggleStatus = (status: string) => {
    setStatusFilter(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    )
  }

  const defaultCenter: [number, number] = [55.7558, 37.6173] // Moscow

  return (
    <div className="h-[calc(100vh-8rem)] relative">
      {/* Filter Panel */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col space-y-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
        >
          <Filter size={18} className="mr-2" />
          Фильтры
        </button>
        
        {showFilters && (
          <Card className="p-3 shadow-xl">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Статус</p>
            <div className="space-y-2">
              {[
                { value: 'NEW', label: 'Новые', color: 'bg-red-500' },
                { value: 'IN_PROGRESS', label: 'В работе', color: 'bg-yellow-500' },
                { value: 'DONE', label: 'Выполнено', color: 'bg-green-500' },
              ].map((status) => (
                <label key={status.value} className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statusFilter.includes(status.value)}
                    onChange={() => toggleStatus(status.value)}
                    className="mr-2 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className={`w-3 h-3 rounded-full ${status.color} mr-2`} />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{status.label}</span>
                </label>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Task count */}
      <div className="absolute top-4 right-4 z-[1000] bg-white dark:bg-gray-800 rounded-lg shadow-lg px-4 py-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          <MapPin size={16} className="inline mr-1" />
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
          className="h-full w-full rounded-lg"
          style={{ background: '#f3f4f6' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <FitBounds tasks={tasks} />
          <LocateControl />
          
          {tasks.map((task) => (
            <Marker
              key={task.id}
              position={[task.lat!, task.lon!]}
              icon={markerIcons[task.status as keyof typeof markerIcons] || markerIcons.NEW}
              eventHandlers={{
                click: () => setSelectedTask(task),
              }}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <div className="flex items-center justify-between mb-2">
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{task.title}</h3>
                  <p className="text-sm text-gray-600 mb-2">{task.raw_address}</p>
                  <Link
                    to={`/tasks/${task.id}`}
                    className="block w-full text-center py-2 bg-primary-500 text-white text-sm font-medium rounded hover:bg-primary-600 transition"
                  >
                    Подробнее
                  </Link>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}

      {/* Selected Task Panel (Mobile) */}
      {selectedTask && (
        <div className="lg:hidden absolute bottom-0 left-0 right-0 z-[1000] bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl p-4 animate-in slide-in-from-bottom">
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
