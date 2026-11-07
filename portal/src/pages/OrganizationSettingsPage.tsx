import SlaCalendarSection from '@/components/SlaCalendarSection'
import { useEffect, useState } from 'react'
import { Clock, Eye, FileText, History, Landmark, MessageSquare, RotateCcw, Save } from 'lucide-react'
import Button from '@/components/Button'
import EmptyState from '@/components/EmptyState'
import Input from '@/components/Input'
import PageHeader from '@/components/PageHeader'
import QueryStatePanel from '@/components/QueryStatePanel'
import Textarea from '@/components/Textarea'
import { SettingsCard, SettingsRows, SettingsToggle } from '@/components/settings/SettingsSection'
import ServiceCatalogCard from '@/components/acts/ServiceCatalogCard'
import ActLogoField from '@/components/acts/ActLogoField'
import { PRIORITY_LABELS } from '@/config/taskConstants'
import { useOrganizations } from '@/hooks/useOrganizations'
import {
  useOrganizationSettings,
  useSaveOrganizationSettings,
} from '@/hooks/useOrganizationSettings'
import {
  organizationSettingsApi,
  type ActTemplate,
  type OrganizationSettings,
  type OrganizationSettingsUpdate,
  type SlaHours,
} from '@/api/organizationSettings'
import { useAuthStore } from '@/store/authStore'
import { showApiError, showApiSuccess } from '@/utils/apiError'

const DEFAULT_SLA_HOURS: SlaHours = { EMERGENCY: 4, URGENT: 8, CURRENT: 48, PLANNED: 168 }
const PRIORITIES = ['EMERGENCY', 'URGENT', 'CURRENT', 'PLANNED'] as const

// Ширина на десктопе — в шестых долях строки; на телефоне все поля в столбик.
const SPAN = { full: 'md:col-span-6', half: 'md:col-span-3', third: 'md:col-span-2' } as const

const REQUISITE_FIELDS = [
  { key: 'legal_name', label: 'Полное наименование', placeholder: 'ООО «Название»', span: 'full' },
  { key: 'legal_address', label: 'Юридический адрес', span: 'full' },
  { key: 'inn', label: 'ИНН', placeholder: '10 или 12 цифр', numeric: true, maxLength: 12, span: 'third' },
  { key: 'kpp', label: 'КПП', placeholder: '9 цифр', numeric: true, maxLength: 9, span: 'third' },
  { key: 'ogrn', label: 'ОГРН', placeholder: '13 или 15 цифр', numeric: true, maxLength: 15, span: 'third' },
  { key: 'director_name', label: 'Руководитель', placeholder: 'Иванов И. И.', span: 'half' },
  { key: 'director_title', label: 'Должность руководителя', placeholder: 'Генеральный директор', span: 'half' },
  { key: 'bank_name', label: 'Банк', span: 'full' },
  { key: 'bik', label: 'БИК', placeholder: '9 цифр', numeric: true, maxLength: 9, span: 'third' },
  { key: 'account', label: 'Расчётный счёт', placeholder: '20 цифр', numeric: true, maxLength: 20, span: 'third' },
  { key: 'corr_account', label: 'Корр. счёт', placeholder: '20 цифр', numeric: true, maxLength: 20, span: 'third' },
] as const

type RequisiteKey = (typeof REQUISITE_FIELDS)[number]['key']

type FormState = {
  requisites: Record<RequisiteKey, string>
  actNumberPrefix: string
  actFooterText: string
  hours: Record<keyof SlaHours, string>
  defaultHours: boolean
  repeatWindowDays: string
  escalations: boolean
  template: ActTemplate
  notifyTelegram: boolean
  smsEnabled: boolean
  // Пусто — ключ не меняем (сервер его не показывает)
  smsApiId: string
}

const TEMPLATE_TOGGLES = [
  { key: 'show_bank_details', title: 'Банковские реквизиты', description: 'Счёт и банк в шапке акта.' },
  { key: 'show_prices', title: 'Цены и итог', description: 'Выключите, если акт подтверждает работы без сумм (например, по договору).' },
  { key: 'show_stamp_place', title: 'Место для печати', description: '«М.П.» под подписью исполнителя.' },
] as const

function toForm(settings: OrganizationSettings): FormState {
  const requisites = Object.fromEntries(
    REQUISITE_FIELDS.map(({ key }) => [key, settings[key] ?? ''])
  ) as Record<RequisiteKey, string>
  return {
    requisites,
    actNumberPrefix: settings.act_number_prefix ?? 'А',
    actFooterText: settings.act_footer_text ?? '',
    hours: Object.fromEntries(
      PRIORITIES.map((p) => [p, String(settings.sla_hours[p])])
    ) as Record<keyof SlaHours, string>,
    defaultHours: !settings.sla_hours_customized,
    repeatWindowDays: String(settings.repeat_window_days),
    escalations: settings.sla_escalations_enabled ?? true,
    // Сервер всегда отдаёт бланк целиком (поля со значениями по умолчанию).
    template: { ...settings.act_template } as ActTemplate,
    notifyTelegram: settings.notify_telegram_enabled ?? true,
    smsEnabled: settings.sms_enabled ?? false,
    smsApiId: '',
  }
}

function OrganizationSettingsForm({ organizationId }: { organizationId?: number }) {
  const query = useOrganizationSettings(organizationId)
  const save = useSaveOrganizationSettings(organizationId)
  const [form, setForm] = useState<FormState | null>(null)

  useEffect(() => {
    if (query.data) setForm(toForm(query.data))
  }, [query.data])

  if (!form) {
    return (
      <QueryStatePanel
        state={query.isError ? 'error' : 'loading'}
        onRetry={query.refetch}
        isRetrying={query.isFetching}
      />
    )
  }

  const setRequisite = (key: RequisiteKey, value: string) =>
    setForm({ ...form, requisites: { ...form.requisites, [key]: value } })

  const setHour = (priority: keyof SlaHours, value: string) =>
    setForm({ ...form, hours: { ...form.hours, [priority]: value }, defaultHours: false })

  const resetHours = () =>
    setForm({
      ...form,
      hours: Object.fromEntries(
        PRIORITIES.map((p) => [p, String(DEFAULT_SLA_HOURS[p])])
      ) as Record<keyof SlaHours, string>,
      defaultHours: true,
    })

  const setTemplate = (fields: Partial<ActTemplate>) =>
    setForm({ ...form, template: { ...form.template, ...fields } })

  const payload = (): OrganizationSettingsUpdate => ({
    ...Object.fromEntries(
      REQUISITE_FIELDS.map(({ key }) => [key, form.requisites[key].trim() || null])
    ),
    act_number_prefix: form.actNumberPrefix.trim() || 'А',
    act_footer_text: form.actFooterText.trim() || null,
    act_template: { ...form.template, contacts: form.template.contacts?.trim() || null },
    sla_hours: form.defaultHours
      ? null
      : (Object.fromEntries(PRIORITIES.map((p) => [p, Number(form.hours[p])])) as SlaHours),
    repeat_window_days: Number(form.repeatWindowDays),
    sla_escalations_enabled: form.escalations,
    notify_telegram_enabled: form.notifyTelegram,
    sms_enabled: form.smsEnabled,
    sms_api_id: form.smsApiId.trim() || null,
  })

  const openPreview = async () => {
    // Окно открываем до запроса, иначе браузер сочтёт его всплывающим.
    const target = window.open('', '_blank')
    try {
      const url = URL.createObjectURL(await organizationSettingsApi.previewAct(payload(), organizationId))
      if (target) target.location.href = url
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      target?.close()
      showApiError(error, 'Не удалось построить предпросмотр')
    }
  }

  const handleSave = () => {
    save.mutate(
      payload(),
      {
        onSuccess: () => showApiSuccess('Настройки организации сохранены'),
        onError: (error) => showApiError(error, 'Не удалось сохранить настройки'),
      }
    )
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Реквизиты"
        icon={Landmark}
        description="Попадают в шапку актов выполненных работ."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          {REQUISITE_FIELDS.map((field) => (
            <div key={field.key} className={SPAN[field.span]}>
              <Input
                label={field.label}
                placeholder={'placeholder' in field ? field.placeholder : undefined}
                inputMode={'numeric' in field && field.numeric ? 'numeric' : undefined}
                maxLength={'maxLength' in field ? field.maxLength : undefined}
                value={form.requisites[field.key]}
                onChange={(event) => setRequisite(field.key, event.target.value)}
              />
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Бланк акта"
        icon={FileText}
        description="Как выглядит акт выполненных работ. Выпущенные акты не меняются — у каждого остаётся бланк, с которым он оформлен."
        action={
          <Button size="sm" variant="secondary" onClick={openPreview}>
            <Eye className="mr-1.5 h-4 w-4" />
            Предпросмотр PDF
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <ActLogoField organizationId={organizationId} hasLogo={Boolean(query.data?.has_act_logo)} />
          </div>
          <Input
            label="Заголовок"
            maxLength={120}
            value={form.template.title}
            onChange={(event) => setTemplate({ title: event.target.value })}
          />
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Фирменный цвет</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Фирменный цвет"
                className="h-10 w-14 cursor-pointer rounded border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-700"
                value={form.template.accent_color}
                onChange={(event) => setTemplate({ accent_color: event.target.value.toUpperCase() })}
              />
              <span className="font-mono text-sm text-gray-600 dark:text-gray-300">{form.template.accent_color}</span>
            </div>
          </div>
          <div>
            <Input
              label="Префикс номера"
              maxLength={10}
              value={form.actNumberPrefix}
              onChange={(event) => setForm({ ...form, actNumberPrefix: event.target.value })}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Номер акта: {form.actNumberPrefix.trim() || 'А'}-{new Date().getFullYear()}-000001
            </p>
          </div>
          <Input
            label="Контакты под реквизитами"
            placeholder="тел. +7 (812) 000-00-00 · сайт"
            maxLength={300}
            value={form.template.contacts ?? ''}
            onChange={(event) => setTemplate({ contacts: event.target.value })}
          />
          <Input
            label="Подпись исполнителя"
            maxLength={40}
            value={form.template.executor_label}
            onChange={(event) => setTemplate({ executor_label: event.target.value })}
          />
          <Input
            label="Подпись заказчика"
            maxLength={40}
            value={form.template.customer_label}
            onChange={(event) => setTemplate({ customer_label: event.target.value })}
          />
          <div className="md:col-span-2">
            <Textarea
              label="Текст о приёмке работ"
              rows={2}
              maxLength={1000}
              value={form.template.acceptance_text}
              onChange={(event) => setTemplate({ acceptance_text: event.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Textarea
              label="Текст внизу акта"
              placeholder="Например: гарантия на выполненные работы — 6 месяцев."
              rows={2}
              maxLength={2000}
              value={form.actFooterText}
              onChange={(event) => setForm({ ...form, actFooterText: event.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <SettingsRows>
            {TEMPLATE_TOGGLES.map((toggle) => (
              <SettingsToggle
                key={toggle.key}
                title={toggle.title}
                description={toggle.description}
                checked={form.template[toggle.key]}
                onChange={(checked) => setTemplate({ [toggle.key]: checked })}
              />
            ))}
            </SettingsRows>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Сроки по приоритету"
        icon={Clock}
        description="Сколько часов даётся на заявку с момента создания. Если у заявки есть плановая дата, срок — конец этого дня. Новые нормативы действуют для новых заявок и при следующей правке."
        action={
          !form.defaultHours && (
            <Button size="sm" variant="secondary" onClick={resetHours}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Стандартные
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {PRIORITIES.map((priority) => (
            <Input
              key={priority}
              type="number"
              min={1}
              max={8760}
              label={`${PRIORITY_LABELS[priority]}, ч`}
              value={form.hours[priority]}
              onChange={(event) => setHour(priority, event.target.value)}
            />
          ))}
        </div>
        <div className="mt-4">
          <SettingsToggle
            title="Напоминания о сроках"
            description="Исполнителю и диспетчерам — когда срок подходит или истёк, аварийная или срочная заявка ждёт исполнителя или начала работы; утром — сводка просроченных. Ночью (22–8) пуши только по аварийным."
            checked={form.escalations}
            onChange={(checked) => setForm({ ...form, escalations: checked })}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title="Уведомления заявителю"
        icon={MessageSquare}
        description="Заявитель следит за заявкой по ссылке на статус (кнопка «Ссылка заявителю» в карточке заявки). С неё же — подписка на Telegram."
      >
        <div className="space-y-3">
          <SettingsToggle
            title="Telegram"
            description={
              query.data?.telegram_available
                ? 'Сообщения подписавшимся: в работе, назначена дата, выполнена, отменена.'
                : 'Бот не настроен на сервере (TELEGRAM_BOT_TOKEN и TELEGRAM_BOT_USERNAME) — подписка недоступна.'
            }
            checked={form.notifyTelegram}
            onChange={(checked) => setForm({ ...form, notifyTelegram: checked })}
          />
          <SettingsToggle
            title="SMS через SMS.ru"
            description="На телефон заявки: при приёме — со ссылкой на статус, при выполнении. Платно, по тарифу SMS.ru."
            checked={form.smsEnabled}
            onChange={(checked) => setForm({ ...form, smsEnabled: checked })}
          />
          {form.smsEnabled && (
            <div className="max-w-sm">
              <Input
                label="API-ключ SMS.ru (api_id)"
                type="password"
                autoComplete="off"
                placeholder={query.data?.sms_configured ? 'Ключ задан — оставьте пустым' : 'Ключ из личного кабинета SMS.ru'}
                value={form.smsApiId}
                onChange={(event) => setForm({ ...form, smsApiId: event.target.value })}
              />
              {query.data?.sms_configured && (
                <button
                  type="button"
                  className="mt-1 text-xs text-red-600 hover:underline dark:text-red-400"
                  onClick={() =>
                    save.mutate(
                      { ...payload(), sms_api_id: '' },
                      { onSuccess: () => showApiSuccess('Ключ SMS.ru удалён') },
                    )
                  }
                >
                  Удалить ключ
                </button>
              )}
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Повторные заявки"
        icon={History}
        description="Подсказка в форме новой заявки показывает заявки, закрытые на этом месте за последние N дней. Повторы и дубли отмечают вручную в карточке заявки."
      >
        <div className="max-w-[12rem]">
          <Input
            type="number"
            min={1}
            max={365}
            label="Закрытые за, дней"
            value={form.repeatWindowDays}
            onChange={(event) => setForm({ ...form, repeatWindowDays: event.target.value })}
          />
        </div>
      </SettingsCard>

      <div className="flex justify-end">
        <Button onClick={handleSave} isLoading={save.isPending}>
          <Save className="mr-1.5 h-4 w-4" />
          Сохранить
        </Button>
      </div>
    </div>
  )
}

export default function OrganizationSettingsPage() {
  const organizationId = useAuthStore((state) => state.user?.organizationId ?? null)
  const isSuperadmin = organizationId == null
  const { data: organizations = [] } = useOrganizations(false, isSuperadmin)
  const [selectedOrgId, setSelectedOrgId] = useState<number | undefined>(undefined)

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Организация"
        description="Реквизиты для документов, нумерация актов, сроки и повторы заявок."
      />

      {isSuperadmin && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Организация
          </label>
          <select
            aria-label="Организация"
            value={selectedOrgId ?? ''}
            onChange={(e) => setSelectedOrgId(e.target.value ? Number(e.target.value) : undefined)}
            className="field max-w-sm"
          >
            <option value="">Выберите организацию</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {isSuperadmin && selectedOrgId == null ? (
        <EmptyState
          icon={Landmark}
          title="Выберите организацию"
          description="Реквизиты и сроки настраиваются для каждой организации отдельно."
        />
      ) : (
        <OrganizationSettingsForm
          key={selectedOrgId ?? 'own'}
          organizationId={isSuperadmin ? selectedOrgId : undefined}
        />
      )}

      {(isSuperadmin ? selectedOrgId : organizationId) != null && <SlaCalendarSection key={selectedOrgId ?? organizationId} organizationId={(isSuperadmin ? selectedOrgId : organizationId)!} />}

      {/* Прайс ведётся пользователями организации (API берёт организацию из входа) */}
      {!isSuperadmin && <ServiceCatalogCard />}
    </div>
  )
}
