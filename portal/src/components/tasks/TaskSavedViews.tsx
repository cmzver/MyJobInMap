import { FormEvent, useEffect, useState } from 'react'
import { BookmarkPlus, Trash2 } from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Modal from '@/components/Modal'
import type { TaskSavedView, TaskSavedViewSettings } from '@/hooks/useTaskSavedViews'

interface TaskSavedViewsProps {
  views: TaskSavedView[]
  activeViewId: string
  currentSettings: TaskSavedViewSettings
  onApply: (view: TaskSavedView) => void
  onSave: (name: string, settings: TaskSavedViewSettings) => void
  onDelete: (view: TaskSavedView) => void
}

export default function TaskSavedViews({
  views,
  activeViewId,
  currentSettings,
  onApply,
  onSave,
  onDelete,
}: TaskSavedViewsProps) {
  const [isSaveOpen, setIsSaveOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const activeView = views.find((view) => view.id === activeViewId)

  useEffect(() => {
    if (!isSaveOpen) {
      setName('')
      setError('')
    }
  }, [isSaveOpen])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const normalizedName = name.trim()
    if (normalizedName.length < 2) {
      setError('Введите не менее двух символов')
      return
    }
    if (views.some((view) => view.name.toLocaleLowerCase('ru') === normalizedName.toLocaleLowerCase('ru'))) {
      setError('Вид с таким названием уже существует')
      return
    }

    onSave(normalizedName, currentSettings)
    setIsSaveOpen(false)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
        <label htmlFor="task-saved-view" className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Сохранённые виды
        </label>
        <select
          id="task-saved-view"
          value={activeViewId}
          onChange={(event) => {
            const view = views.find((item) => item.id === event.target.value)
            if (view) onApply(view)
          }}
          className="h-9 min-w-48 max-w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          <option value="">Текущие фильтры</option>
          {views.map((view) => (
            <option key={view.id} value={view.id}>{view.name}</option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={() => setIsSaveOpen(true)} className="h-9">
          <BookmarkPlus className="mr-2 h-4 w-4" />
          Сохранить вид
        </Button>
        {activeView && (
          <button
            type="button"
            aria-label={`Удалить сохранённый вид «${activeView.name}»`}
            onClick={() => onDelete(activeView)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <Modal isOpen={isSaveOpen} onClose={() => setIsSaveOpen(false)} title="Сохранить текущий вид" size="sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            autoFocus
            label="Название"
            aria-label="Название сохранённого вида"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (error) setError('')
            }}
            maxLength={40}
            placeholder="Например, Аварийные без исполнителя"
            error={error}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Сохраняются поиск, фильтры, сортировка и группировка.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsSaveOpen(false)}>Отмена</Button>
            <Button type="submit">Сохранить</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
