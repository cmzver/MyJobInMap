import { useState } from 'react'
import { Wrench, Plus, Edit2, Trash2 } from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Textarea from '@/components/Textarea'
import Spinner from '@/components/Spinner'
import Badge from '@/components/Badge'
import Modal from '@/components/Modal'
import { cn } from '@/utils/cn'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import {
  useDefectTypes,
  useAddDefectType,
  useUpdateDefectType,
  useDeleteDefectType,
} from '@/hooks/useSettings'
import type { DefectType } from '@/hooks/useSettings'
import { SettingsCard, SettingsIconButton } from '@/components/settings/SettingsSection'

// Соответствует enum SystemType на бэкенде (api.generated SystemType) и
// лейблам систем обслуживания на остальных экранах.
const SYSTEM_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'video_surveillance', label: 'Видеонаблюдение' },
  { value: 'intercom', label: 'Домофония' },
  { value: 'fire_protection', label: 'АППЗ' },
  { value: 'access_control', label: 'СКД' },
  { value: 'fire_alarm', label: 'ОПС' },
  { value: 'other', label: 'Другое' },
]

const systemTypeLabel = (value: string) =>
  SYSTEM_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value

export default function DefectTypesTab() {
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<DefectType | null>(null)

  const { data: defectTypes, isLoading } = useDefectTypes()
  const deleteDefectType = useDeleteDefectType()

  const handleDelete = (defectType: DefectType) => {
    if (!confirm(`Удалить тип «${defectType.name}»?`)) return
    deleteDefectType.mutate(defectType.id, {
      onSuccess: () => showApiSuccess('Тип неисправности удалён'),
      onError: (error) => showApiError(error, 'Не удалось удалить тип'),
    })
  }

  return (
    <>
      <SettingsCard
        title="Типы неисправностей"
        icon={Wrench}
        description="Справочник типов неисправностей для формы заявки. Тип можно ограничить системами обслуживания — без ограничения он доступен для всех систем."
        action={
          <Button size="sm" onClick={() => { setEditing(null); setShowModal(true) }}>
            <Plus className="mr-1.5 h-4 w-4" />
            Добавить тип
          </Button>
        }
      >
        {isLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : !defectTypes?.length ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center dark:border-gray-700">
            <Wrench className="mx-auto mb-2 h-6 w-6 text-gray-400" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Типы не заданы</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Добавьте первый тип, чтобы он появился при создании заявки.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {defectTypes.map((defectType) => (
              <div
                key={defectType.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-slate-50/80 p-3 dark:border-gray-800 dark:bg-gray-800/50"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white">{defectType.name}</p>
                  {defectType.description && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{defectType.description}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {defectType.system_types && defectType.system_types.length > 0 ? (
                      defectType.system_types.map((systemType) => (
                        <Badge key={systemType} variant="info">{systemTypeLabel(systemType)}</Badge>
                      ))
                    ) : (
                      <Badge variant="gray">Все системы</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center">
                  <SettingsIconButton
                    title="Редактировать"
                    onClick={() => { setEditing(defectType); setShowModal(true) }}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </SettingsIconButton>
                  <SettingsIconButton
                    title="Удалить"
                    tone="danger"
                    onClick={() => handleDelete(defectType)}
                    disabled={deleteDefectType.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </SettingsIconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {showModal && (
        <DefectTypeModal defectType={editing} onClose={() => setShowModal(false)} />
      )}
    </>
  )
}

function DefectTypeModal({
  defectType,
  onClose,
}: {
  defectType: DefectType | null
  onClose: () => void
}) {
  const isEdit = Boolean(defectType)
  const [name, setName] = useState(defectType?.name ?? '')
  const [description, setDescription] = useState(defectType?.description ?? '')
  const [systemTypes, setSystemTypes] = useState<string[]>(defectType?.system_types ?? [])
  const [error, setError] = useState('')

  const addDefectType = useAddDefectType()
  const updateDefectType = useUpdateDefectType()
  const isPending = addDefectType.isPending || updateDefectType.isPending

  const toggleSystemType = (value: string) => {
    setSystemTypes((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    )
  }

  const handleSubmit = () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Введите название типа')
      return
    }

    const payload = {
      name: trimmedName,
      description: description.trim() || undefined,
      system_types: systemTypes,
    }

    const handlers = {
      onSuccess: () => {
        showApiSuccess(isEdit ? 'Тип обновлён' : 'Тип добавлен')
        onClose()
      },
      onError: (err: unknown) =>
        showApiError(err, isEdit ? 'Не удалось обновить тип' : 'Не удалось добавить тип'),
    }

    if (isEdit && defectType) {
      updateDefectType.mutate({ id: defectType.id, payload }, handlers)
    } else {
      addDefectType.mutate(payload, handlers)
    }
  }

  return (
    <Modal
      isOpen
      onClose={() => { if (!isPending) onClose() }}
      title={isEdit ? 'Редактировать тип неисправности' : 'Новый тип неисправности'}
      size="md"
    >
      <div className="space-y-4">
        <Input
          label="Название"
          value={name}
          onChange={(event) => { setName(event.target.value); if (error) setError('') }}
          error={error}
          placeholder="Например: Нет изображения"
          autoFocus
        />

        <Textarea
          label="Описание (необязательно)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Краткое пояснение к типу неисправности"
        />

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Системы обслуживания
          </label>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            Тип будет показан только для выбранных систем. Без выбора — доступен для всех.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SYSTEM_TYPE_OPTIONS.map((option) => {
              const checked = systemTypes.includes(option.value)
              return (
                <label
                  key={option.value}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors',
                    checked
                      ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSystemType(option.value)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  {option.label}
                </label>
              )
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {isEdit ? 'Сохранить' : 'Добавить'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
