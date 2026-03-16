import { useEffect, useState, useRef } from 'react'
import type { ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { mutationToast } from '@/utils/apiError'
import { logError } from '@/utils/logger'
import { formatDateTime, getSla } from '@/utils/dateFormat'
import { 
  ArrowLeft, 
  MapPin,
  User, 
  Edit,
  Trash2,
  MessageSquare,
  Image as ImageIcon,
  Clock,
  AlertTriangle,
  Send,
  Upload,
  X,
  ExternalLink,
  Phone,
  ChevronDown
} from 'lucide-react'
import { useTask, useUpdateTaskStatus, useDeleteTask, useAssignTask } from '@/hooks/useTasks'
import { useUsers } from '@/hooks/useUsers'
import { useComments, useAddComment } from '@/hooks/useComments'
import { usePhotos, useUploadPhoto, useDeletePhoto } from '@/hooks/usePhotos'
import { photosApi } from '@/api/photos'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import Button from '@/components/Button'
import Spinner from '@/components/Spinner'
import StatusBadge from '@/components/StatusBadge'
import PriorityBadge from '@/components/PriorityBadge'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import Textarea from '@/components/Textarea'
import type { TaskStatus } from '@/types/task'
import { cn } from '@/utils/cn'
import { getAvailableStatusTransitions, getStatusCommentCopy, requiresStatusComment } from '@/config/taskConstants'

const statusLabels: Record<TaskStatus, string> = {
  NEW: 'Новая',
  IN_PROGRESS: 'В работе',
  DONE: 'Выполнена',
  CANCELLED: 'Отменена',
}

const photoTypeLabels: Record<string, string> = {
  before: 'До',
  after: 'После',
  completion: 'Завершение',
}

const systemTypeLabels: Record<string, string> = {
  video_surveillance: 'Видеонаблюдение',
  intercom: 'Домофон',
  fire_protection: 'Пожаротушение',
  access_control: 'СКУД',
  fire_alarm: 'ОПС',
  other: 'Другое',
}

interface CollapsibleCardProps {
  title: string
  meta?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

function CollapsibleCard({ title, meta, defaultOpen = false, children }: CollapsibleCardProps) {
  return (
    <details className="group rounded-xl" open={defaultOpen}>
      <summary className="list-none [&::-webkit-details-marker]:hidden">
        <div className="bg-white dark:bg-gray-800 rounded-xl group-open:rounded-b-none transition-colors border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-2">
            <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
            <span className="text-sm font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">{title}</span>
          </div>
          {meta && <div className="text-sm text-gray-500 dark:text-gray-400">{meta}</div>}
        </div>
      </summary>
      <div className="bg-white dark:bg-gray-800 rounded-b-xl transition-colors border border-t-0 border-gray-200 dark:border-gray-700 p-4">
        {children}
      </div>
    </details>
  )
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const taskId = Number(id)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [comment, setComment] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<TaskStatus | null>(null)
  const [statusComment, setStatusComment] = useState('')
  const [statusCommentError, setStatusCommentError] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  const [photoType, setPhotoType] = useState<'before' | 'after' | 'completion'>('before')
  const [isEditingAssignee, setIsEditingAssignee] = useState(false)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [isLoadingPhotoUrls, setIsLoadingPhotoUrls] = useState(false)

  // Data fetching
  const { data: task, isLoading, isError, error } = useTask(taskId)
  const { data: comments = [], isLoading: commentsLoading } = useComments(taskId)
  const { data: photos = [], isLoading: photosLoading } = usePhotos(taskId)
  const { data: users = [] } = useUsers()
  const { user } = useAuthStore()
  const { data: permissions } = usePermissions()
  
  // Filter only workers and dispatchers for assignment
  const assignableUsers = users.filter(u => u.is_active && (u.role === 'worker' || u.role === 'dispatcher'))

  // Mutations
  const updateStatusMutation = useUpdateTaskStatus()
  const deleteMutation = useDeleteTask()
  const addCommentMutation = useAddComment()
  const uploadPhotoMutation = useUploadPhoto()
  const deletePhotoMutation = useDeletePhoto()
  const assignMutation = useAssignTask()

  useEffect(() => {
    let cancelled = false
    const createdUrls: string[] = []

    const loadPhotoUrls = async () => {
      if (photos.length === 0) {
        setPhotoUrls({})
        return
      }

      setIsLoadingPhotoUrls(true)
      try {
        const entries = await Promise.all(
          photos.map(async (photo) => {
            try {
              const url = await photosApi.getPhotoBlobUrl(photo.filename)
              createdUrls.push(url)
              return [photo.filename, url] as const
            } catch (err) {
              logError('Failed to load photo', err)
              return null
            }
          })
        )

        if (!cancelled) {
          const next: Record<string, string> = {}
          entries.forEach((entry) => {
            if (entry) {
              next[entry[0]] = entry[1]
            }
          })
          setPhotoUrls(next)
        } else {
          createdUrls.forEach((url) => photosApi.revokePhotoUrl(url))
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPhotoUrls(false)
        }
      }
    }

    loadPhotoUrls()

    return () => {
      cancelled = true
      createdUrls.forEach((url) => photosApi.revokePhotoUrl(url))
    }
  }, [photos])

  useEffect(() => {
    setSelectedPhoto(null)
  }, [photos])

  const formatStatusLabel = (value?: string | null) => {
    if (!value) return 'Не указан'
    return statusLabels[value as TaskStatus] || value
  }

  const formatAssigneeLabel = (value?: string | null) => {
    return value || 'Не назначен'
  }

  const resetStatusCommentDialog = () => {
    setPendingStatus(null)
    setStatusComment('')
    setStatusCommentError('')
  }

  const submitStatusChange = (newStatus: TaskStatus, commentText = '') => {
    updateStatusMutation.mutate(
      { id: taskId, status: newStatus, comment: commentText },
      mutationToast({
        success: `Статус изменён на "${statusLabels[newStatus]}"`,
        error: 'Ошибка изменения статуса',
        onSuccess: () => resetStatusCommentDialog(),
      })
    )
  }

  const handleStatusChange = (newStatus: TaskStatus) => {
    if (requiresStatusComment(newStatus)) {
      setPendingStatus(newStatus)
      setStatusComment('')
      setStatusCommentError('')
      return
    }

    submitStatusChange(newStatus)
  }

  const handleConfirmStatusChange = () => {
    if (!pendingStatus) return
    const commentCopy = getStatusCommentCopy(pendingStatus)
    if (!statusComment.trim()) {
      setStatusCommentError(commentCopy.error)
      return
    }

    submitStatusChange(pendingStatus, statusComment.trim())
  }

  const handleDelete = () => {
    deleteMutation.mutate(taskId, mutationToast({
      success: 'Заявка удалена',
      error: 'Ошибка удаления',
      onSuccess: () => navigate('/tasks'),
    }))
  }

  const handleAddComment = () => {
    if (!comment.trim()) return
    
    addCommentMutation.mutate(
      { taskId, text: comment.trim() },
      mutationToast({
        success: 'Комментарий добавлен',
        error: 'Ошибка добавления комментария',
        onSuccess: () => setComment(''),
      })
    )
  }

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    uploadPhotoMutation.mutate(
      { taskId, file, photoType },
      mutationToast({
        success: 'Фото загружено',
        error: 'Ошибка загрузки фото',
        onSuccess: () => {
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        },
      })
    )
  }

  const handleDeletePhoto = (photoId: number) => {
    if (!confirm('Удалить фото?')) return
    
    deletePhotoMutation.mutate(
      { photoId, taskId },
      mutationToast({
        success: 'Фото удалено',
        error: 'Ошибка удаления фото',
        onSuccess: () => setSelectedPhoto(null),
      })
    )
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError || !task) {
    return (
      <div className="max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => navigate('/tasks')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Назад к списку
        </Button>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <h3 className="text-lg font-medium text-red-800 dark:text-red-400 mb-1">Ошибка загрузки</h3>
          <p className="text-red-600 dark:text-red-500 text-sm">
            {error instanceof Error ? error.message : 'Заявка не найдена'}
          </p>
        </div>
      </div>
    )
  }

  const availableTransitions = getAvailableStatusTransitions(task.status)
  const sla = getSla(task.planned_date, task.status)
  const canEdit = permissions?.permissions?.edit_tasks ?? user?.role === 'admin'
  const canDelete = permissions?.permissions?.delete_tasks ?? user?.role === 'admin'
  const historyEvents = [
    {
      id: `created-${task.id}`,
      title: 'Заявка создана',
      timestamp: task.created_at,
      author: 'Система',
      details: ['Создано в системе'],
    },
    ...comments
      .filter((c) => c.old_status || c.new_status || c.old_assignee || c.new_assignee)
      .map((c) => {
        const isStatusChange = c.old_status || c.new_status
        const isAssigneeChange = c.old_assignee || c.new_assignee
        const details = []

        if (isStatusChange) {
          details.push(
            `Статус: ${formatStatusLabel(c.old_status)} -> ${formatStatusLabel(c.new_status)}`
          )
        }

        if (isAssigneeChange) {
          details.push(
            `Исполнитель: ${formatAssigneeLabel(c.old_assignee)} -> ${formatAssigneeLabel(c.new_assignee)}`
          )
        }

        let title = 'Изменение заявки'
        if (isStatusChange && !isAssigneeChange) title = 'Статус изменен'
        if (!isStatusChange && isAssigneeChange) title = 'Исполнитель изменен'
        if (isStatusChange && isAssigneeChange) title = 'Изменение статуса и исполнителя'

        return {
          id: `comment-${c.id}`,
          title,
          timestamp: c.created_at,
          author: c.author || 'Система',
          details,
        }
      }),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return (
    <div className="max-w-5xl mx-auto w-full min-w-0 overflow-x-hidden">
      <div className="mb-5">
        <Button variant="ghost" onClick={() => navigate('/tasks')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Назад к списку
        </Button>

        <Card compact className="overflow-hidden">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {task.task_number || `#${task.id}`}
                </span>
                <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                <PriorityBadge
                  priority={task.priority}
                  className="rounded-md border border-gray-200 bg-transparent px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-600 dark:border-gray-700 dark:bg-transparent dark:text-gray-300"
                />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white break-words">
                {task.title}
              </h1>
            </div>

            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/tasks/${taskId}/edit`)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Редактировать
                </Button>
              )}
              {canDelete && (
                <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить
                </Button>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/40 p-3.5 dark:border-gray-700 dark:bg-gray-900/20">
            <div className="flex items-start gap-3">
              <div className="pt-0.5 text-gray-400 dark:text-gray-500">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  Адрес заявки
                </p>
                <p className="mt-1 text-[15px] font-semibold text-gray-900 dark:text-white break-words leading-5">
                  {task.raw_address || 'Не указан'}
                </p>
                {(task.customer_name || task.customer_phone || (task.lat && task.lon)) && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-600 dark:text-gray-300">
                    {task.customer_name && <span>{task.customer_name}</span>}
                    {task.customer_phone && (
                      <a
                        className="inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400"
                        href={`tel:${task.customer_phone}`}
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {task.customer_phone}
                      </a>
                    )}
                    {task.lat && task.lon && (
                      <button
                        type="button"
                        onClick={() => window.open(`https://yandex.ru/maps/?pt=${task.lon},${task.lat}&z=17`, '_blank')}
                        className="inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Открыть на карте
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-800">
            <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                Исполнитель
              </p>
              <div className="mt-1.5 text-sm font-medium text-gray-900 dark:text-white">
                {isEditingAssignee ? (
                  <select
                    value={task.assigned_user_id || ''}
                    onChange={(e) => {
                      const newAssigneeId = e.target.value ? Number(e.target.value) : null
                      assignMutation.mutate(
                        { id: taskId, assignedUserId: newAssigneeId },
                        mutationToast({
                          success: 'Исполнитель изменён',
                          error: 'Ошибка назначения',
                          onSuccess: () => setIsEditingAssignee(false),
                        })
                      )
                    }}
                    disabled={assignMutation.isPending}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    autoFocus
                    onBlur={() => setIsEditingAssignee(false)}
                  >
                    <option value="">Не назначен</option>
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.username}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() => setIsEditingAssignee(true)}
                    className="inline-flex items-center gap-1 text-left text-sm transition-colors hover:text-primary-600 dark:hover:text-primary-400"
                    title="Нажмите, чтобы изменить"
                  >
                    <span>{task.assigned_user_name || 'Не назначен'}</span>
                    <Edit className="h-3 w-3 text-gray-400" />
                  </button>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                Статус и срок
              </p>
              <div className="mt-1.5 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    status={task.status}
                    className="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]"
                  />
                  <span className="text-gray-900 dark:text-white">{formatDateTime(task.planned_date)}</span>
                  <span className={cn('text-sm font-medium', sla.tone)}>{sla.label}</span>
                </div>
                {availableTransitions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {availableTransitions.map((status) => (
                      <Button
                        key={status}
                        variant="outline"
                        size="sm"
                        className={cn(
                          'h-auto rounded-md px-2.5 py-1 text-xs font-medium',
                          status === 'CANCELLED'
                            ? 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                        )}
                        onClick={() => handleStatusChange(status)}
                        isLoading={updateStatusMutation.isPending}
                      >
                        {statusLabels[status]}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0 border-t border-gray-200 pt-3 dark:border-gray-800 lg:pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                Неисправность
              </p>
              <p className="mt-1.5 text-sm font-medium text-gray-900 dark:text-white break-words">
                {task.defect_type || 'Не указана'}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 break-words">
                {task.system_type ? systemTypeLabels[task.system_type] || task.system_type : 'Система не указана'}
              </p>
            </div>

            <div className="min-w-0 border-t border-gray-200 pt-3 dark:border-gray-800 lg:pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                Оплата
              </p>
              <p className="mt-1.5 text-sm font-medium text-gray-900 dark:text-white break-words">
                {task.is_paid ? (task.payment_amount ? `${task.payment_amount} ₽` : 'Платная') : 'Не указана'}
              </p>
            </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <span>Создана {formatDateTime(task.created_at)}</span>
            <span className="hidden h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600 sm:block" />
            <span>Обновлена {formatDateTime(task.updated_at)}</span>
          </div>
        </Card>
      </div>

      <div className="space-y-5 min-w-0">

          <Card title="Описание" compact>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
              {task.description || 'Описание не указано'}
            </p>
          </Card>

          <CollapsibleCard
            title="Фотографии"
            meta={photosLoading ? '...' : `${photos.length} фото`}
          >
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <select
                value={photoType}
                onChange={(e) => setPhotoType(e.target.value as 'before' | 'after' | 'completion')}
                className="text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded px-2 py-1"
              >
                <option value="before">До</option>
                <option value="after">После</option>
                <option value="completion">Завершение</option>
              </select>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                isLoading={uploadPhotoMutation.isPending}
              >
                <Upload className="h-4 w-4 mr-2" />
                Загрузить
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>
            {photosLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : photos.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <ImageIcon className="h-12 w-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                <p>Фотографии не загружены</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((photo) => {
                  const photoUrl = photoUrls[photo.filename]
                  return (
                  <div 
                    key={photo.id} 
                    className="relative group cursor-pointer"
                    onClick={() => photoUrl && setSelectedPhoto(photoUrl)}
                  >
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={photo.original_name || 'Фото'}
                        className="w-full h-24 object-cover rounded-lg"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-24 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs text-gray-500">
                        {isLoadingPhotoUrls ? 'Загрузка...' : 'Нет доступа'}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg" />
                    <span className="absolute bottom-1 left-1 text-xs bg-black/50 text-white px-1.5 py-0.5 rounded">
                      {photoTypeLabels[photo.photo_type] || photo.photo_type}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeletePhoto(photo.id)
                      }}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  )
                })}
              </div>
            )}
          </CollapsibleCard>

          {/* History */}
          <CollapsibleCard
            title="История изменений"
            meta={commentsLoading ? '...' : `${historyEvents.length}`}
          >
            {commentsLoading ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : historyEvents.length === 0 ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                <Clock className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                <p>История изменений пуста</p>
              </div>
            ) : (
              <div className="space-y-4">
                {historyEvents.map((event, index) => (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-2 w-2 rounded-full bg-primary-500 mt-2" />
                      {index < historyEvents.length - 1 && (
                        <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700" />
                      )}
                    </div>
                    <div className="flex-1 pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {event.title}
                        </p>
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDateTime(event.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {event.author}
                      </p>
                      {event.details.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {event.details.map((detail, detailIndex) => (
                            <p
                              key={`${event.id}-${detailIndex}`}
                              className="text-sm text-gray-700 dark:text-gray-300"
                            >
                              {detail}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleCard>

          {/* Comments */}
          <CollapsibleCard
            title="Комментарии"
            meta={
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-4 w-4" />
                {comments.length}
              </span>
            }
          >
            <div className="space-y-4">
              {commentsLoading ? (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                  <p>Комментариев пока нет</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {comments.map((c) => {
                    const isStatusChange = c.old_status && c.new_status
                    const isAssigneeChange = c.old_assignee || c.new_assignee
                    const isSystemComment = isStatusChange || isAssigneeChange
                    
                    return (
                      <div 
                        key={c.id} 
                        className={`rounded-lg p-3 ${
                          isSystemComment 
                            ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' 
                            : 'bg-gray-50 dark:bg-gray-700/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-medium text-sm ${
                            isSystemComment 
                              ? 'text-blue-700 dark:text-blue-300' 
                              : 'text-gray-900 dark:text-white'
                          }`}>
                            {c.author || 'Система'}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDateTime(c.created_at)}
                          </span>
                        </div>
                        {isStatusChange && (
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                              {c.old_status}
                            </span>
                            <span className="text-gray-400">→</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300">
                              {c.new_status}
                            </span>
                          </div>
                        )}
                        {isAssigneeChange && (
                          <div className="flex items-center gap-2 mb-1">
                            <User className="h-3 w-3 text-gray-400" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {c.old_assignee || 'Не назначен'}
                            </span>
                            <span className="text-gray-400">→</span>
                            <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
                              {c.new_assignee || 'Не назначен'}
                            </span>
                          </div>
                        )}
                        {!isSystemComment && (
                          <p className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap">
                            {c.text}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Add comment */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Добавить комментарий..."
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                    disabled={addCommentMutation.isPending}
                  />
                  <Button 
                    onClick={handleAddComment} 
                    disabled={!comment.trim()}
                    isLoading={addCommentMutation.isPending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CollapsibleCard>
      </div>

      <Modal
        isOpen={pendingStatus !== null}
        onClose={() => {
          if (!updateStatusMutation.isPending) {
            resetStatusCommentDialog()
          }
        }}
        title={getStatusCommentCopy(pendingStatus).title}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {getStatusCommentCopy(pendingStatus).description}
          </p>
          <Textarea
            value={statusComment}
            onChange={(event) => {
              setStatusComment(event.target.value)
              if (statusCommentError) {
                setStatusCommentError('')
              }
            }}
            label={getStatusCommentCopy(pendingStatus).label}
            placeholder={getStatusCommentCopy(pendingStatus).placeholder}
            error={statusCommentError}
            disabled={updateStatusMutation.isPending}
            autoFocus
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={resetStatusCommentDialog} disabled={updateStatusMutation.isPending}>
              Отмена
            </Button>
            <Button onClick={handleConfirmStatusChange} isLoading={updateStatusMutation.isPending}>
              {getStatusCommentCopy(pendingStatus).submitText}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Удалить заявку?
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Вы уверены, что хотите удалить заявку {task.task_number || `#${task.id}`}? 
              Это действие нельзя отменить.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
                Отмена
              </Button>
              <Button 
                variant="danger" 
                onClick={handleDelete}
                isLoading={deleteMutation.isPending}
              >
                Удалить
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Photo lightbox */}
      {selectedPhoto && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300"
            onClick={() => setSelectedPhoto(null)}
          >
            <X className="h-8 w-8" />
          </button>
          <img
            src={selectedPhoto}
            alt="Фото"
            className="max-w-full max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
