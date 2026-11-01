import { useEffect, useState } from 'react'
import { Clock, FileText, History, Landmark, RotateCcw, Save } from 'lucide-react'
import Button from '@/components/Button'
import EmptyState from '@/components/EmptyState'
import Input from '@/components/Input'
import PageHeader from '@/components/PageHeader'
import QueryStatePanel from '@/components/QueryStatePanel'
import Textarea from '@/components/Textarea'
import { SettingsCard, SettingsToggle } from '@/components/settings/SettingsSection'
import ServiceCatalogCard from '@/components/acts/ServiceCatalogCard'
import { PRIORITY_LABELS } from '@/config/taskConstants'
import { useOrganizations } from '@/hooks/useOrganizations'
import {
  useOrganizationSettings,
  useSaveOrganizationSettings,
} from '@/hooks/useOrganizationSettings'
import type { OrganizationSettings, SlaHours } from '@/api/organizationSettings'
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
}

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

  const handleSave = () => {
    const sla_hours = form.defaultHours
      ? null
      : (Object.fromEntries(PRIORITIES.map((p) => [p, Number(form.hours[p])])) as SlaHours)
    save.mutate(
      {
        ...Object.fromEntries(
          REQUISITE_FIELDS.map(({ key }) => [key, form.requisites[key].trim() || null])
        ),
        act_number_prefix: form.actNumberPrefix.trim() || 'А',
        act_footer_text: form.actFooterText.trim() || null,
        sla_hours,
        repeat_window_days: Number(form.repeatWindowDays),
        sla_escalations_enabled: form.escalations,
      },
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

      <SettingsCard title="Акты" icon={FileText} description="Нумерация и текст внизу акта.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[12rem_1fr]">
          <Input
            label="Префикс номера"
            maxLength={10}
            value={form.actNumberPrefix}
            onChange={(event) => setForm({ ...form, actNumberPrefix: event.target.value })}
          />
          <p className="self-end pb-2 text-sm text-gray-500 dark:text-gray-400">
            Номер акта: {form.actNumberPrefix.trim() || 'А'}-{new Date().getFullYear()}-000001
          </p>
          <div className="md:col-span-2">
            <Textarea
              label="Текст внизу акта"
              placeholder="Например: гарантия на выполненные работы — 6 месяцев."
              rows={3}
              maxLength={2000}
              value={form.actFooterText}
              onChange={(event) => setForm({ ...form, actFooterText: event.target.value })}
            />
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
    <div className="space-y-6">
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
            value={selectedOrgId ?? ''}
            onChange={(e) => setSelectedOrgId(e.target.value ? Number(e.target.value) : undefined)}
            className="w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
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

      {/* Прайс ведётся пользователями организации (API берёт организацию из входа) */}
      {!isSuperadmin && <ServiceCatalogCard />}
    </div>
  )
}
