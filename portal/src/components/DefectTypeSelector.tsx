import { useMemo } from 'react'
import { AlertCircle } from 'lucide-react'
import Card from '@/components/Card'
import { useDefectTypes } from '@/hooks/useSettings'

interface DefectTypeSelectorProps {
  value: string
  onChange: (id: string, name: string) => void  // Теперь передаём и id, и name
  systemType?: string  // Тип выбранной системы для фильтрации
  error?: string
}

export default function DefectTypeSelector({
  value,
  onChange,
  systemType,
  error,
}: DefectTypeSelectorProps) {
  const { data: defectTypes = [], isLoading } = useDefectTypes()

  // Фильтруем типы неисправностей по системе
  const filteredDefectTypes = useMemo(() => {
    if (!systemType) return defectTypes
    
    return defectTypes.filter((type) => {
      // Если system_types пустой или не задан — показываем для всех систем (универсальные)
      if (!type.system_types || type.system_types.length === 0) {
        return true
      }
      // Иначе проверяем что тип системы входит в список
      return type.system_types.includes(systemType)
    })
  }, [defectTypes, systemType])

  // Проверяем, есть ли сохранённое значение в отфильтрованном списке
  const savedValueInList = filteredDefectTypes.some(
    (type) => type.id === value || type.name === value
  )
  // Если значение не в списке, ищем его в полном списке для отображения
  const savedDefectType = !savedValueInList && value 
    ? defectTypes.find((type) => type.id === value || type.name === value)
    : null

  // Если система не выбрана — показываем предупреждение
  if (!systemType) {
    return (
      <Card title="Тип неисправности">
        <div className="flex items-center gap-2 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            Сначала выберите систему обслуживания
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Тип неисправности">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Выберите тип неисправности *
        </label>

        {/* Показываем сохранённый тип, если он не в текущем списке */}
        {savedDefectType && (
          <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Текущий тип: <strong>{savedDefectType.name || value}</strong>
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Этот тип не относится к выбранной системе. Вы можете выбрать другой из списка ниже.
            </p>
          </div>
        )}
        {/* Если значение не найдено вообще (например, введено вручную или удалено) */}
        {!savedValueInList && value && !savedDefectType && (
          <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Текущий тип: <strong>{value}</strong>
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Вы можете выбрать другой тип из списка ниже.
            </p>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Загрузка...</p>
        ) : filteredDefectTypes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredDefectTypes.map((type) => (
              <label key={type.id} className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="defect-type"
                  value={type.id}
                  checked={value === type.id || value === type.name}
                  onChange={() => onChange(type.id, type.name)}
                  className="w-4 h-4 text-primary-500 border-gray-300 dark:border-gray-600 focus:ring-primary-500 bg-white dark:bg-gray-800"
                />
                <span className="ml-2 text-sm text-gray-900 dark:text-white">
                  {type.name}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
            Нет доступных типов неисправностей для выбранной системы.
            <br />
            <span className="text-xs">Типы настраиваются в разделе "Настройки".</span>
          </p>
        )}

        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      </div>
    </Card>
  )
}
