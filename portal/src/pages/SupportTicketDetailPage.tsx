import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bug,
  CheckCircle2,
  Clock3,
  LifeBuoy,
  Lightbulb,
  MessageSquare,
  Send,
} from 'lucide-react'

import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Card from '@/components/Card'
import EmptyState from '@/components/EmptyState'
import QueryError from '@/components/QueryError'
import Select from '@/components/Select'
import Spinner from '@/components/Spinner'
import Textarea from '@/components/Textarea'
import { useMarkSupportTicketNotificationsRead, useUnreadSupportNotifications } from '@/hooks/useNotifications'
import { useCreateSupportComment, useSupportTicket, useUpdateSupportTicket } from '@/hooks/useSupport'
import { useAuthStore } from '@/store/authStore'
import { getRoleLabel, isSuperadminRole } from '@/types/user'
import type { SupportTicketCategory, SupportTicketStatus } from '@/types/support'
import { formatDateRelative, formatDateTime } from '@/utils/dateFormat'
import { showApiError, showApiSuccess } from '@/utils/apiError'

const statusOptions = [
  { value: 'new', label: 'Новый' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'resolved', label: 'Решён' },
  { value: 'closed', label: 'Закрыт' },
] as const

const categoryMeta: Record<
  SupportTicketCategory,
  { label: string; badge: 'danger' | 'info' | 'primary'; icon: typeof Bug }
> = {
  bug: { label: 'Ошибка', badge: 'danger', icon: Bug },
  improvement: { label: 'Улучшение', badge: 'info', icon: Lightbulb },
  feedback: { label: 'Обратная связь', badge: 'primary', icon: MessageSquare },
}

const statusMeta: Record<
  SupportTicketStatus,
  { label: string; badge: 'warning' | 'info' | 'success' | 'gray' }
> = {
  new: { label: 'Новый', badge: 'warning' },
  in_progress: { label: 'В работе', badge: 'info' },
  resolved: { label: 'Решён', badge: 'success' },
  closed: { label: 'Закрыт', badge: 'gray' },
}

export default function SupportTicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const parsedTicketId = Number(ticketId)
  const { user } = useAuthStore()
  const canManage = isSuperadminRole(user?.role, user?.organizationId)

  const { data: ticket, isLoading, error, refetch } = useSupportTicket(parsedTicketId)
  const { data: unreadSupportNotifications = [] } = useUnreadSupportNotifications({ enabled: Boolean(user) })
  const {
    mutate: markSupportNotificationsRead,
    isPending: isMarkingSupportNotificationsRead,
  } = useMarkSupportTicketNotificationsRead()
  const updateMutation = useUpdateSupportTicket()
  const createCommentMutation = useCreateSupportComment()

  const [commentBody, setCommentBody] = useState('')
  const [statusDraft, setStatusDraft] = useState<SupportTicketStatus>('new')
  const [responseDraft, setResponseDraft] = useState('')

  const currentStatus = ticket?.status ?? 'new'
  const currentResponse = ticket?.admin_response ?? ''
  const isDirty = statusDraft !== currentStatus || responseDraft.trim() !== currentResponse

  useEffect(() => {
    if (!ticket) return
    setStatusDraft(ticket.status)
    setResponseDraft(ticket.admin_response ?? '')
  }, [ticket])

  useEffect(() => {
    if (!Number.isFinite(parsedTicketId) || isMarkingSupportNotificationsRead) {
      return
    }

    const hasUnreadForCurrentTicket = unreadSupportNotifications.some(
      (notification) => notification.support_ticket_id === parsedTicketId,
    )

    if (hasUnreadForCurrentTicket) {
      markSupportNotificationsRead(parsedTicketId)
    }
  }, [isMarkingSupportNotificationsRead, markSupportNotificationsRead, parsedTicketId, unreadSupportNotifications])

  if (!Number.isFinite(parsedTicketId)) {
    return (
      <EmptyState
        icon={LifeBuoy}
        title="Некорректный тикет"
        description="Проверьте ссылку на обращение."
      />
    )
  }

  const handleAddComment = (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedComment = commentBody.trim()
    if (!normalizedComment) return

    createCommentMutation.mutate(
      {
        ticketId: parsedTicketId,
        payload: { body: normalizedComment },
      },
      {
        onSuccess: () => {
          setCommentBody('')
          showApiSuccess('Комментарий добавлен')
        },
        onError: (mutationError) => {
          showApiError(mutationError, 'Не удалось добавить комментарий')
        },
      },
    )
  }

  const handleUpdateTicket = () => {
    updateMutation.mutate(
      {
        ticketId: parsedTicketId,
        payload: {
          status: statusDraft,
          admin_response: responseDraft.trim() || null,
        },
      },
      {
        onSuccess: () => {
          showApiSuccess('Тикет обновлён')
        },
        onError: (mutationError) => {
          showApiError(mutationError, 'Не удалось обновить тикет')
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !ticket) {
    return (
      <QueryError
        error={error as Error}
        onRetry={() => refetch()}
        message="Не удалось загрузить тикет поддержки"
      />
    )
  }

  const CategoryIcon = categoryMeta[ticket.category].icon

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link to="/support" className="inline-flex items-center text-sm text-primary-600 hover:text-primary-700">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к списку
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-xl bg-gray-100 p-3 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
              <CategoryIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{ticket.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={categoryMeta[ticket.category].badge}>{categoryMeta[ticket.category].label}</Badge>
                <Badge variant={statusMeta[ticket.status].badge}>{statusMeta[ticket.status].label}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
          <div>Создан: {formatDateTime(ticket.created_at)}</div>
          <div className="mt-1">Обновлён: {formatDateTime(ticket.updated_at)}</div>
          {ticket.resolved_at && <div className="mt-1">Закрыт: {formatDateTime(ticket.resolved_at)}</div>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]">
        <div className="space-y-6">
          <Card title="Описание обращения">
            <div className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">{ticket.description}</p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                <span>Автор: {ticket.created_by.full_name || ticket.created_by.username}</span>
                <span>Роль: {getRoleLabel(ticket.created_by.role)}</span>
                <span>{formatDateRelative(ticket.created_at)}</span>
              </div>
            </div>
          </Card>

          <Card title={`Комментарии и статусы (${ticket.comments.length})`}>
            {ticket.comments.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="Пока без комментариев"
                description="История обсуждения и смены статусов появится здесь."
              />
            ) : (
              <div className="space-y-4">
                {ticket.comments.map((comment) => (
                  <article
                    key={comment.id}
                    className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={comment.comment_type === 'status_change' ? 'info' : 'gray'}>
                          {comment.comment_type === 'status_change' ? 'Статус' : 'Комментарий'}
                        </Badge>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {comment.author.full_name || comment.author.username}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {getRoleLabel(comment.author.role)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(comment.created_at)}
                      </div>
                    </div>

                    {comment.comment_type === 'status_change' ? (
                      <div className="mt-3 flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                        <Clock3 className="h-4 w-4 text-primary-500" />
                        <span>
                          Статус изменён: {statusMeta[comment.old_status ?? 'new'].label} →{' '}
                          {statusMeta[comment.new_status ?? 'new'].label}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">
                        {comment.body}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Новый комментарий">
            <form className="space-y-4" onSubmit={handleAddComment}>
              <Textarea
                label="Комментарий"
                placeholder="Уточните детали, задайте вопрос или дайте промежуточный ответ."
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                rows={5}
                required
              />
              <div className="flex justify-end">
                <Button type="submit" isLoading={createCommentMutation.isPending}>
                  <Send className="mr-2 h-4 w-4" />
                  Отправить
                </Button>
              </div>
            </form>
          </Card>

          {canManage && (
            <Card title="Управление тикетом">
              <div className="space-y-4">
                <Select
                  label="Статус"
                  options={statusOptions.map((item) => ({ value: item.value, label: item.label }))}
                  value={statusDraft}
                  onChange={(value) => setStatusDraft(value as SupportTicketStatus)}
                />
                <Textarea
                  label="Последний ответ поддержки"
                  placeholder="Краткое резюме для карточки тикета."
                  value={responseDraft}
                  onChange={(event) => setResponseDraft(event.target.value)}
                  rows={4}
                />
                <Button
                  className="w-full"
                  onClick={handleUpdateTicket}
                  isLoading={updateMutation.isPending}
                  disabled={!isDirty}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Сохранить изменения
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
