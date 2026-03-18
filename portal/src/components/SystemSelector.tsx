import { useState, useEffect } from 'react'
import { ChevronDown, AlertCircle } from 'lucide-react'
import { addressesApi } from '@/api/addresses'
import Spinner from '@/components/Spinner'
import Card from '@/components/Card'
import type { AddressSystem } from '@/types/address'

interface SystemSelectorProps {
  buildingId?: number
  buildingAddress: string
  value: number | string
  onChange: (systemId: number | string, system?: AddressSystem) => void
  error?: string
}

export default function SystemSelector({
  buildingId,
  buildingAddress,
  value,
  onChange,
  error,
}: SystemSelectorProps) {
  const [systems, setSystems] = useState<AddressSystem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!buildingId) return

    const loadSystems = async () => {
      setIsLoading(true)
      try {
        const result = await addressesApi.getSystems(buildingId)
        setSystems(result)
        
        // Если есть выбранное значение, найдём систему и вызовем onChange для установки system_type
        if (value) {
          const selectedSys = result.find((s: AddressSystem) => s.id === value || s.id === Number(value))
          if (selectedSys) {
            onChange(selectedSys.id, selectedSys)
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('Error loading systems:', err)
        setSystems([])
      } finally {
        setIsLoading(false)
      }
    }

    loadSystems()
  }, [buildingId])

  const selectedSystem = systems.find((s) => s.id === value || s.id === Number(value))

  const systemTypeLabels: Record<string, string> = {
    video_surveillance: '📹 Видеонаблюдение',
    intercom: '🔔 Домофония',
    fire_protection: '🔥 АППЗ',
    access_control: '🔐 СКД',
    fire_alarm: '🚨 ОПС',
    other: '⚙️ Другое',
  }

  const getSystemTypeLabel = (type: string): string => {
    return systemTypeLabels[type] || type
  }

  if (!buildingId) {
    return (
      <Card title="Система обслуживания">
        <div className="flex items-center gap-2 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            Выберите адрес из базы, если нужна привязка к системе. Для стороннего адреса заявку можно создать без системы обслуживания.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Система обслуживания">
      <div className="space-y-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          На этом адресе: <span className="font-medium text-gray-900 dark:text-white">{buildingAddress}</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : systems.length > 0 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-left flex justify-between items-center transition-colors ${
                error
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 focus:ring-primary-500'
              } focus:outline-none focus:ring-2`}
            >
              <span>
                {selectedSystem ? (
                  <div className="flex flex-col">
                    <span className="font-medium">{selectedSystem.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {getSystemTypeLabel(selectedSystem.system_type)}
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-500">Выберите систему</span>
                )}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
                {systems.map((system) => (
                  <button
                    key={system.id}
                    type="button"
                    onClick={() => {
                      onChange(system.id, system)
                      setIsOpen(false)
                    }}
                    className={`w-full text-left px-3 py-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0 transition-colors ${
                      value === system.id
                        ? 'bg-primary-50 dark:bg-primary-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {system.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {getSystemTypeLabel(system.system_type)}
                        </p>
                        {system.status && (
                          <p className={`text-xs mt-1 ${
                            system.status === 'active'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            Статус: {system.status === 'active' ? 'Активна' : 'Неактивна'}
                          </p>
                        )}
                      </div>
                      {value === system.id && (
                        <div className="ml-2 text-primary-500">✓</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
          </div>
        ) : (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              На этом адресе нет зарегистрированных систем обслуживания. Заявку можно создать без привязки к системе.
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
