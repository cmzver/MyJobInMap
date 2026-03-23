import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bug,
  Clock3,
  LifeBuoy,
  Lightbulb,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react'

import Badge from '@/components/Badge'
import Button from '@/components/Button'
import Card from '@/components/Card'
import EmptyState from '@/components/EmptyState'
import Input from '@/components/Input'
import QueryError from '@/components/QueryError'
import Select from '@/components/Select'
import Spinner from '@/components/Spinner'
import Textarea from '@/components/Textarea'
import { useUnreadSupportNotifications } from '@/hooks/useNotifications'
import { usePublicLoginBranding } from '@/hooks/useSettings'
import { useCreateSupportTicket, useSupportTickets } from '@/hooks/useSupport'
import { useAuthStore } from '@/store/authStore'
import type { SupportTicketCategory, SupportTicketStatus } from '@/types/support'
import { isSuperadminRole } from '@/types/user'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import { formatDateRelative, formatDateTime } from '@/utils/dateFormat'

const categoryOptions = [
  { value: 'bug', label: 'Ошибка' },
  { value: 'improvement', label: 'Улучшение' },
  { value: 'feedback', label: 'Обратная связь' },
] as const

const statusOptions = [
  { value: 'new', label: 'Новый' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'resolved', label: 'Решен' },
  { value: 'closed', label: 'Закрыт' },
] as const

const statusFilterOptions = [{ value: 'all', label: 'Все статусы' }, ...statusOptions]

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
  resolved: { label: 'Решен', badge: 'success' },
  closed: { label: 'Закрыт', badge: 'gray' },
}

export default function SupportPage() {
  const { user } = useAuthStore()
  const canManage = isSuperadminRole(user?.role, user?.organizationId)
  const ticketScope = canManage ? 'all' : 'mine'
  const [statusFilter, setStatusFilter] = useState<'all' | SupportTicketStatus>('all')
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'bug' as SupportTicketCategory,
  })

  const { data: branding } = usePublicLoginBranding()
  const {
    data: tickets = [],
    isLoading,
    error,
    refetch,
    isFetching,
  } = useSupportTickets({
    scope: ticketScope,
    status: statusFilter === 'all' ? undefined : statusFilter,
  })
  const { data: unreadSupportNotifications = [] } = useUnreadSupportNotifications({ enabled: Boolean(user) })
  const createMutation = useCreateSupportTicket()

  const openCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'new' || ticket.status === 'in_progress').length,
    [tickets],
  )
  const resolvedCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'resolved' || ticket.status === 'closed').length,
    [tickets],
  )
  const unreadByTicketId = useMemo(() => {
    const map: Record<number, number> = {}

    for (const notification of unreadSupportNotifications) {
      if (!notification.support_ticket_id) continue
      map[notification.support_ticket_id] = (map[notification.support_ticket_id] ?? 0) + 1
    }

    return map
  }, [unreadSupportNotifications])

  const handleCreateTicket = (event: React.FormEvent) => {
    event.preventDefault()

    createMutation.mutate(form, {
      onSuccess: () => {
        setForm({
          title: '',
          description: '',
          category: 'bug',
        })
        showApiSuccess('Обращение отправлено')
      },
      onError: (mutationError) => {
        showApiError(mutationError, 'Не удалось отправить обращение')
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Поддержка</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Ошибки, улучшения и ответы поддержки собраны в одном списке. Новые события отмечаются прямо на
            нужном тикете.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatPill title="Всего" value={tickets.length} tone="primary" />
        <StatPill title="Открытые" value={openCount} tone="warning" />
        <StatPill title="Закрытые" value={resolvedCount} tone="success" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
        <Card title="Новое обращение" compact>
          <form className="space-y-3" onSubmit={handleCreateTicket}>
            <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
              <Select
                label="Тип"
                options={categoryOptions.map((item) => ({ value: item.value, label: item.label }))}
                value={form.category}
                onChange={(value) => setForm((current) => ({ ...current, category: value as SupportTicketCategory }))}
              />
              <Input
                label="Заголовок"
                placeholder="Коротко опишите проблему или идею"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                minLength={4}
                maxLength={200}
                required
              />
            </div>

            <Textarea
              label="Описание"
              placeholder="Что произошло, как повторить, чего вы ожидали."
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              minLength={10}
              maxLength={4000}
              rows={4}
              required
            />

            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                <span>Тикет останется в вашей истории и уйдет супер-админам.</span>
              </div>
              <Button type="submit" size="sm" isLoading={createMutation.isPending}>
                <Send className="mr-2 h-4 w-4" />
                Отправить
              </Button>
            </div>
          </form>
        </Card>

        <Card title="Контакты" compact>
          <div className="space-y-3">
            <div className="rounded-lg border border-dashed border-primary-200 bg-primary-50 px-3 py-3 text-xs leading-5 text-primary-700 dark:border-primary-900/60 dark:bg-primary-950/30 dark:text-primary-200">
              Для багов добавьте шаги воспроизведения. Для улучшений опишите текущий и ожидаемый сценарий.
            </div>
            <ContactRow
              icon={Mail}
              label="Email"
              value={branding?.supportEmail ?? 'Не указан'}
              href={branding?.supportEmail ? `mailto:${branding.supportEmail}` : undefined}
            />
            <ContactRow
              icon={Phone}
              label="Телефон"
              value={branding?.supportPhone ?? 'Не указан'}
              href={branding?.supportPhone ? `tel:${branding.supportPhone}` : undefined}
            />
            <ContactRow icon={Clock3} label="Часы" value={branding?.supportHours || 'Пн-Пт, 09:00-18:00'} />
          </div>
        </Card>
      </div>

      <Card
        title={canManage ? 'Все обращения' : 'Мои обращения'}
        compact
        action={
          <div className="w-44">
            <Select
              options={statusFilterOptions.map((item) => ({ value: item.value, label: item.label }))}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as 'all' | SupportTicketStatus)}
            />
          </div>
        }
      >
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <QueryError error={error as Error} onRetry={() => refetch()} message="Не удалось загрузить обращения" />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="Обращений пока нет"
            description="Создайте первое обращение, чтобы передать баг, предложение или обратную связь."
          />
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => {
              const CategoryIcon = categoryMeta[ticket.category].icon
              const unreadCount = unreadByTicketId[ticket.id] ?? 0

              return (
                <article
                  key={ticket.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 transition-colors dark:border-gray-700 dark:bg-gray-900/40"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center rounded-lg bg-gray-100 p-2 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                          <CategoryIcon className="h-4 w-4" />
                        </div>
                        <h2 className="truncate text-base font-semibold text-gray-900 dark:text-white">{ticket.title}</h2>
                        {unreadCount > 0 && <TicketBubble count={unreadCount} />}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant={categoryMeta[ticket.category].badge}>{categoryMeta[ticket.category].label}</Badge>
                        <Badge variant={statusMeta[ticket.status].badge}>{statusMeta[ticket.status].label}</Badge>
                        {canManage && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Автор: {ticket.created_by.full_name || ticket.created_by.username}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-xs text-gray-500 dark:text-gray-400 md:text-right">
                      <div>{formatDateRelative(ticket.updated_at)}</div>
                      <div className="mt-0.5">{formatDateTime(ticket.updated_at)}</div>
                    </div>
                  </div>

                  <p className="mt-3 line-clamp-2 whitespace-pre-wrap text-sm leading-5 text-gray-700 dark:text-gray-300">
                    {ticket.description}
                  </p>

                  {ticket.admin_response && (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                        Ответ поддержки
                      </div>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm leading-5 text-emerald-900 dark:text-emerald-100">
                        {ticket.admin_response}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>Создан: {formatDateTime(ticket.created_at)}</span>
                      {ticket.resolved_at && <span>Закрыт: {formatDateTime(ticket.resolved_at)}</span>}
                    </div>

                    <Link
                      to={`/support/${ticket.id}`}
                      className="inline-flex items-center self-start rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-600"
                    >
                      Открыть
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

function StatPill({
  title,
  value,
  tone,
}: {
  title: string
  value: number
  tone: 'primary' | 'warning' | 'success'
}) {
  const toneClasses = {
    primary:
      'border-primary-100 bg-primary-50/70 text-primary-700 dark:border-primary-900/50 dark:bg-primary-950/20 dark:text-primary-200',
    warning:
      'border-amber-100 bg-amber-50/70 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200',
    success:
      'border-emerald-100 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200',
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] ${toneClasses[tone]}`}>
      <span className="font-medium text-current/75">{title}</span>
      <span className="text-sm font-semibold text-current">{value}</span>
    </div>
  )
}

function TicketBubble({ count }: { count: number }) {
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
      {count > 9 ? '9+' : count}
    </span>
  )
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Mail
  label: string
  value: string
  href?: string
}) {
  const content = (
    <div className="flex items-start gap-3 rounded-lg border border-gray-200 px-3 py-2.5 transition-colors dark:border-gray-700">
      <div className="rounded-lg bg-gray-100 p-2 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
          {label}
        </div>
        <div className="mt-0.5 break-all text-sm font-medium text-gray-900 dark:text-white">{value}</div>
      </div>
    </div>
  )

  if (!href) {
    return content
  }

  return (
    <a href={href} className="block hover:opacity-90">
      {content}
    </a>
  )
}
