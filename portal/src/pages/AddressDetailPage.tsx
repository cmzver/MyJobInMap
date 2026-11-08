import { useState } from 'react'
import type { ReactNode } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { formatDateOnly as formatDate } from '@/utils/dateFormat'
import toast from 'react-hot-toast'
import { showApiError, showApiSuccess } from '@/utils/apiError'
import { cn } from '@/utils/cn'
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  FileText,
  Wrench,
  Package,
  Phone,
  Mail,
  Plus,
  Edit,
  Trash2,
  Download,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  XCircle,
  Video,
  Flame,
  Key,
  Bell,
  Upload,
  Camera,
  Server,
  HardDrive,
  Wifi,
  Lock,
  Settings,
  Zap,
} from 'lucide-react'
import { 
  useAddressFull, 
  useCreateSystem, 
  useUpdateSystem, 
  useDeleteSystem,
  useCreateEquipment,
  useUpdateEquipment,
  useDeleteEquipment,
  useUploadDocument,
  useDeleteDocument,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from '@/hooks/useAddressCard'
import { useUpdateAddress } from '@/hooks/useAddresses'
import { addressesApi } from '@/api/addresses'
import { actsApi } from '@/api/acts'
import { useActs } from '@/hooks/useActs'
import { ACT_STATUS, formatRub } from '@/components/acts/actLabels'
import Button from '@/components/Button'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import Spinner from '@/components/Spinner'
import Modal from '@/components/Modal'
import IntercomPanelsSection from '@/components/IntercomPanelsSection'
import AddressAssigneesSection from '@/components/AddressAssigneesSection'
import { SystemForm, EquipmentForm, DocumentForm, ContactForm, AddressForm } from '@/components/AddressCardForms'
import type { 
  SystemFormData, 
  EquipmentFormData, 
  DocumentFormData,
  ContactFormData, 
  AddressFormData 
} from '@/components/AddressCardForms'
import type { 
  AddressSystem,
  AddressEquipment,
  AddressContact,
  SystemType,
  SystemStatus,
  EquipmentType,
  EquipmentStatus,
  DocumentType,
  ContactType
} from '@/types/address'
import { formatFileSize } from '@/utils/fileSize'

// Иконки для типов систем
const systemTypeIcons: Record<SystemType, typeof Video> = {
  video_surveillance: Video,
  intercom: Phone,
  fire_protection: Flame,
  access_control: Key,
  fire_alarm: Bell,
  other: Settings,
}

// Названия типов систем
const systemTypeLabels: Record<SystemType, string> = {
  video_surveillance: 'Видеонаблюдение',
  intercom: 'Домофония',
  fire_protection: 'АППЗ',
  access_control: 'СКД',
  fire_alarm: 'ОПС',
  other: 'Другое',
}

// Цвета статусов систем
type StatusVariant = 'success' | 'warning' | 'danger' | 'gray'

const systemStatusConfig: Record<SystemStatus, { label: string; variant: StatusVariant }> = {
  active: { label: 'Активна', variant: 'success' },
  maintenance: { label: 'На ремонте', variant: 'warning' },
  disabled: { label: 'Отключена', variant: 'gray' },
}

// Иконки для типов оборудования
const equipmentTypeIcons: Record<EquipmentType, typeof Camera> = {
  camera: Camera,
  dvr: Server,
  intercom_panel: Phone,
  intercom_handset: Phone,
  sensor: Zap,
  controller: HardDrive,
  reader: Key,
  lock: Lock,
  switch: Wifi,
  router: Wifi,
  ups: Zap,
  other: Package,
}

// Названия типов оборудования
const equipmentTypeLabels: Record<EquipmentType, string> = {
  camera: 'Камера',
  dvr: 'Видеорегистратор',
  intercom_panel: 'Панель вызова',
  intercom_handset: 'Трубка домофона',
  sensor: 'Датчик',
  controller: 'Контроллер',
  reader: 'Считыватель',
  lock: 'Замок',
  switch: 'Коммутатор',
  router: 'Роутер',
  ups: 'ИБП',
  other: 'Другое',
}

// Цвета статусов оборудования
const equipmentStatusConfig: Record<EquipmentStatus, { label: string; variant: StatusVariant; Icon: typeof CheckCircle }> = {
  working: { label: 'Работает', variant: 'success', Icon: CheckCircle },
  faulty: { label: 'Неисправно', variant: 'danger', Icon: AlertCircle },
  dismantled: { label: 'Демонтировано', variant: 'gray', Icon: XCircle },
}

// Названия типов документов
const documentTypeLabels: Record<DocumentType, string> = {
  contract: 'Договор',
  estimate: 'Смета',
  act: 'Акт',
  scheme: 'Схема',
  passport: 'Паспорт',
  other: 'Другое',
}

// Названия типов контактов
const contactTypeLabels: Record<ContactType, string> = {
  chairman: 'Председатель',
  elder: 'Старший по дому',
  management: 'УК',
  concierge: 'Консьерж',
  other: 'Другое',
}

type TabType = 'systems' | 'equipment' | 'documents'

const tabs: { id: TabType; label: string; Icon: typeof Wrench }[] = [
  { id: 'systems', label: 'Системы', Icon: Wrench },
  { id: 'equipment', label: 'Оборудование', Icon: Package },
  { id: 'documents', label: 'Документы', Icon: FileText },
]

const isTab = (value: string | null): value is TabType => tabs.some((tab) => tab.id === value)


const isBlank = (value: ReactNode) => value === null || value === undefined || value === '' || value === 0

/** Число с подписью — ячейка мини-полосы в боковой колонке. */
function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse px-2 py-2.5 text-center">
      <dt className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className={cn('text-base font-semibold tabular-nums text-gray-900 dark:text-white', tone, isBlank(value) && 'text-gray-300 dark:text-gray-600')}>
        {isBlank(value) ? '—' : value}
      </dd>
    </div>
  )
}

/** Строка «подпись — значение» узкой колонки. */
function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-gray-900 dark:text-white">
        {isBlank(value) ? <span className="font-normal text-gray-400 dark:text-gray-500">—</span> : value}
      </dd>
    </div>
  )
}

function IconButton({
  title,
  onClick,
  danger = false,
  children,
}: {
  title: string
  onClick: () => void
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700',
        danger ? 'hover:text-red-600 dark:hover:text-red-400' : 'hover:text-gray-700 dark:hover:text-gray-200',
      )}
    >
      {children}
    </button>
  )
}

function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 justify-end gap-0.5">{children}</div>
}

function StatusPill({ variant, children }: { variant: StatusVariant; children: ReactNode }) {
  return (
    <Badge variant={variant} className="gap-1">
      {children}
    </Badge>
  )
}

function EmptyRow({ Icon, text }: { Icon: typeof Wrench; text: string }) {
  return (
    <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
      <Icon className="h-4 w-4 text-gray-400" /> {text}
    </p>
  )
}

/** Акты по заявкам объекта — рядом с документами объекта. */
function AddressActsCard({ addressId }: { addressId: number }) {
  const acts = useActs({ address_id: addressId, size: 50 })
  const items = acts.data?.items ?? []
  return (
    <Card flush title={`Акты${acts.data ? ` · ${acts.data.total}` : ''}`}>
      {acts.isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          По заявкам этого объекта актов нет
        </p>
      ) : (
        <table className="data-table min-w-full">
          <thead>
            <tr>
              <th>Акт</th>
              <th>Заявка</th>
              <th className="text-right">Сумма</th>
              <th>Статус</th>
              <th className="w-12" aria-label="PDF" />
            </tr>
          </thead>
          <tbody>
            {items.map((act) => {
              const status = ACT_STATUS[act.status]
              return (
                <tr key={act.id}>
                  <td className="whitespace-nowrap">
                    <span className="font-mono text-xs">{act.number}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400"> · {formatDate(act.created_at)}</span>
                  </td>
                  <td className="w-full min-w-[10rem] max-w-0">
                    <p className="truncate">
                      {act.task_id ? (
                        <Link to={`/tasks/${act.task_id}`} className="text-primary-600 hover:underline dark:text-primary-400">
                          {act.task_number}
                        </Link>
                      ) : (
                        act.task_number
                      )}
                      {act.customer_name && <span className="text-gray-500 dark:text-gray-400"> · {act.customer_name}</span>}
                    </p>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{formatRub(act.total_amount)}</td>
                  <td><Badge variant={status.variant}>{status.label}</Badge></td>
                  <td>
                    <RowActions>
                      <IconButton
                        title="Открыть PDF"
                        onClick={() => actsApi.openPdf(act.id).catch((error) => showApiError(error, 'Не удалось открыть PDF'))}
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </IconButton>
                    </RowActions>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Card>
  )
}

export default function AddressDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const addressId = Number(id)
  
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  // Панели теперь внутри «Оборудования»: старые ссылки ?tab=panels ведут туда же
  const activeTab: TabType = tabParam === 'panels' ? 'equipment' : isTab(tabParam) ? tabParam : 'systems'
  const selectTab = (tab: TabType) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    }, { replace: true })
  
  // Состояния модальных окон
  const [addressModal, setAddressModal] = useState(false)
  const [systemModal, setSystemModal] = useState<{ open: boolean; system: AddressSystem | null }>({ open: false, system: null })
  const [equipmentModal, setEquipmentModal] = useState<{ open: boolean; equipment: AddressEquipment | null }>({ open: false, equipment: null })
  const [documentModal, setDocumentModal] = useState(false)
  const [contactModal, setContactModal] = useState<{ open: boolean; contact: AddressContact | null }>({ open: false, contact: null })
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: number; name: string } | null>(null)
  
  // Загружаем полную информацию об объекте
  const { data: addressFull, isLoading, error } = useAddressFull(addressId)
  
  // Мутация для обновления адреса
  const updateAddress = useUpdateAddress()
  
  // Мутации для систем
  const createSystem = useCreateSystem(addressId)
  const updateSystem = useUpdateSystem(addressId)
  const deleteSystem = useDeleteSystem(addressId)
  
  // Мутации для оборудования
  const createEquipment = useCreateEquipment(addressId)
  const updateEquipment = useUpdateEquipment(addressId)
  const deleteEquipment = useDeleteEquipment(addressId)
  
  // Мутации для документов
  const uploadDocument = useUploadDocument(addressId)
  const deleteDocument = useDeleteDocument(addressId)
  
  // Мутации для контактов
  const createContact = useCreateContact(addressId)
  const updateContact = useUpdateContact(addressId)
  const deleteContact = useDeleteContact(addressId)
  
  // Распаковываем данные
  const address = addressFull
  const systems = addressFull?.systems || []
  const equipment = addressFull?.equipment || []
  const panels = addressFull?.panels || []
  const documents = addressFull?.documents || []
  const contacts = addressFull?.contacts || []
  const taskStats = addressFull?.task_stats || { total: 0, new: 0, in_progress: 0, done: 0, cancelled: 0 }
  
  // Обработчик редактирования адреса
  const handleAddressSubmit = async (data: AddressFormData) => {
    try {
      const payload = {
        ...data,
        entrance_count: data.entrance_count ? parseInt(data.entrance_count) : undefined,
        floor_count: data.floor_count ? parseInt(data.floor_count) : undefined,
        apartment_count: data.apartment_count ? parseInt(data.apartment_count) : undefined,
        counterparty_id: data.counterparty_id ? Number(data.counterparty_id) : null,
        // Точка из справочника — только если выбрали подсказку
        lat: data.lat,
        lon: data.lon,
      }
      
      await updateAddress.mutateAsync({ id: addressId, data: payload })
      showApiSuccess('Адрес обновлён')
      setAddressModal(false)
    } catch (err) {
      showApiError(err, 'Ошибка сохранения адреса')
    }
  }
  
  // Обработчики систем
  const handleSystemSubmit = async (data: SystemFormData) => {
    try {
      const payload = {
        ...data,
        monthly_cost: data.monthly_cost ? parseFloat(data.monthly_cost) : undefined,
        service_start_date: data.service_start_date || undefined,
        service_end_date: data.service_end_date || undefined,
      }
      
      if (systemModal.system) {
        await updateSystem.mutateAsync({ systemId: systemModal.system.id, data: payload })
        showApiSuccess('Система обновлена')
      } else {
        await createSystem.mutateAsync(payload)
        showApiSuccess('Система добавлена')
      }
      setSystemModal({ open: false, system: null })
    } catch (err) {
      showApiError(err, 'Ошибка сохранения системы')
    }
  }
  
  // Обработчики оборудования
  const handleEquipmentSubmit = async (data: EquipmentFormData) => {
    try {
      const payload = {
        ...data,
        quantity: parseInt(data.quantity) || 1,
        system_id: data.system_id ? parseInt(data.system_id) : undefined,
        install_date: data.install_date || undefined,
        warranty_until: data.warranty_until || undefined,
      }
      
      if (equipmentModal.equipment) {
        await updateEquipment.mutateAsync({ equipmentId: equipmentModal.equipment.id, data: payload })
        showApiSuccess('Оборудование обновлено')
      } else {
        await createEquipment.mutateAsync(payload)
        showApiSuccess('Оборудование добавлено')
      }
      setEquipmentModal({ open: false, equipment: null })
    } catch (err) {
      showApiError(err, 'Ошибка сохранения оборудования')
    }
  }
  
  // Обработчики документов
  const handleDocumentSubmit = async (data: DocumentFormData) => {
    if (!data.file) {
      toast.error('Выберите файл')
      return
    }
    try {
      await uploadDocument.mutateAsync({
        file: data.file,
        docType: data.doc_type,
        name: data.name,
        validFrom: data.valid_from || undefined,
        validUntil: data.valid_until || undefined,
        notes: data.notes || undefined,
      })
      showApiSuccess('Документ загружен')
      setDocumentModal(false)
    } catch (err) {
      showApiError(err, 'Ошибка загрузки документа')
    }
  }
  
  // Обработчики контактов
  const handleContactSubmit = async (data: ContactFormData) => {
    try {
      if (contactModal.contact) {
        await updateContact.mutateAsync({ contactId: contactModal.contact.id, data })
        showApiSuccess('Контакт обновлён')
      } else {
        await createContact.mutateAsync(data)
        showApiSuccess('Контакт добавлен')
      }
      setContactModal({ open: false, contact: null })
    } catch (err) {
      showApiError(err, 'Ошибка сохранения контакта')
    }
  }
  
  // Обработчик удаления
  const handleDelete = async () => {
    if (!deleteConfirm) return
    
    try {
      switch (deleteConfirm.type) {
        case 'system':
          await deleteSystem.mutateAsync(deleteConfirm.id)
          showApiSuccess('Система удалена')
          break
        case 'equipment':
          await deleteEquipment.mutateAsync(deleteConfirm.id)
          showApiSuccess('Оборудование удалено')
          break
        case 'document':
          await deleteDocument.mutateAsync(deleteConfirm.id)
          showApiSuccess('Документ удалён')
          break
        case 'contact':
          await deleteContact.mutateAsync(deleteConfirm.id)
          showApiSuccess('Контакт удалён')
          break
      }
      setDeleteConfirm(null)
    } catch (err) {
      showApiError(err, 'Ошибка удаления')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !address) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Объект не найден
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Адрес с ID {addressId} не существует или был удалён
          </p>
          <Button onClick={() => navigate('/addresses')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            К списку адресов
          </Button>
        </Card>
      </div>
    )
  }

  // Расчёт общей стоимости обслуживания (если поле есть)
  const totalMonthlyCost = systems.reduce((sum, s) => sum + (s.monthly_cost || 0), 0)
  
  // Подсчёт оборудования по статусам
  const equipmentByStatus = {
    working: equipment.filter(e => e.status === 'working').length,
    faulty: equipment.filter(e => e.status === 'faulty').length,
    dismantled: equipment.filter(e => e.status === 'dismantled').length,
  }

  const tabCounts: Record<TabType, number> = {
    systems: systems.length,
    equipment: equipment.length + panels.length,
    documents: documents.length,
  }

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        onBack={() => navigate('/addresses')}
        icon={MapPin}
        title={<span className="truncate">{address.address}</span>}
        description="Карточка объекта"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setAddressModal(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Редактировать
            </Button>
            {address.lat && address.lon && (
              <Button size="sm"
                variant="outline"
                onClick={() => window.open(`https://yandex.ru/maps/?pt=${address.lon},${address.lat}&z=17`, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                На карте
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)]">
        {/* Паспорт объекта: короткие факты — узкой колонкой, а не на всю ширину */}
        <aside className="space-y-4">
          <Card flush title="Объект">
            <dl className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 dark:divide-gray-700 dark:border-gray-700">
              <Stat label="Подъездов" value={address.entrance_count} />
              <Stat label="Этажей" value={address.floor_count} />
              <Stat label="Квартир" value={address.apartment_count} />
            </dl>
            <dl className="space-y-2 px-4 py-3 text-sm">
              <Fact label="Район" value={address.district} />
              <Fact
                label="УК"
                value={address.counterparty_id ? (
                  <Link to={`/counterparties/${address.counterparty_id}`} className="text-primary-600 hover:underline dark:text-primary-400">
                    {address.management_company || 'контрагент'}
                  </Link>
                ) : address.management_company}
              />
              <Fact
                label="Телефон УК"
                value={address.management_phone ? (
                  <a href={`tel:${address.management_phone}`} className="text-primary-600 hover:underline dark:text-primary-400">
                    {address.management_phone}
                  </a>
                ) : null}
              />
              <Fact
                label="Абонплата"
                value={totalMonthlyCost > 0 ? `${totalMonthlyCost.toLocaleString('ru-RU')} ₽/мес` : null}
              />
            </dl>
            <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
              <p className="eyebrow">Заметки</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                {address.notes || <span className="text-gray-400 dark:text-gray-500">Нет заметок</span>}
              </p>
            </div>
          </Card>

          <Card
            flush
            title={`Заявки · ${taskStats.total}`}
            action={
              <Link
                to={`/tasks?address_id=${address.id}&address_title=${encodeURIComponent(address.address || '')}`}
                className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                Все <ArrowRight size={14} />
              </Link>
            }
          >
            <dl className="grid grid-cols-4 divide-x divide-gray-100 dark:divide-gray-700">
              <Stat label="Новые" value={taskStats.new} tone="text-blue-600 dark:text-blue-400" />
              <Stat label="В работе" value={taskStats.in_progress} tone="text-amber-700 dark:text-amber-300" />
              <Stat label="Готово" value={taskStats.done} tone="text-green-600 dark:text-green-400" />
              <Stat label="Отмена" value={taskStats.cancelled} />
            </dl>
            <div className="border-t border-gray-100 px-4 py-2 dark:border-gray-700">
              <Link
                to={`/tasks/new?address=${encodeURIComponent(address.address)}`}
                className="flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                <Plus className="h-4 w-4" /> Создать заявку
              </Link>
            </div>
          </Card>

          <Card
            flush
            title="Контакты"
            action={
              <IconButton title="Добавить контакт" onClick={() => setContactModal({ open: true, contact: null })}>
                <Plus className="h-4 w-4" />
              </IconButton>
            }
          >
            {contacts.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Контактов нет</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {contacts.map((contact) => (
                  <li key={contact.id} className="group flex items-start gap-2 px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white" title={contact.name}>{contact.name}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {contactTypeLabels[contact.contact_type]}
                        {contact.is_primary && <span className="font-medium text-primary-600 dark:text-primary-400"> · основной</span>}
                        {contact.notes && ` · ${contact.notes}`}
                      </p>
                      {(contact.phone || contact.email) && (
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400">
                              <Phone className="h-3 w-3" /> {contact.phone}
                            </a>
                          )}
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} className="flex min-w-0 items-center gap-1 text-primary-600 hover:underline dark:text-primary-400">
                              <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{contact.email}</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <RowActions>
                      <IconButton title="Изменить" onClick={() => setContactModal({ open: true, contact })}>
                        <Edit className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton danger title="Удалить" onClick={() => setDeleteConfirm({ type: 'contact', id: contact.id, name: contact.name })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </RowActions>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <AddressAssigneesSection addressId={addressId} />
        </aside>

        {/* Основное: техника объекта — компактными таблицами */}
        <div className="min-w-0 space-y-3">
          <nav role="tablist" className="flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_theme(colors.gray.200)] dark:shadow-[inset_0_-1px_0_theme(colors.gray.700)]">
            {tabs.map(({ id, label, Icon }) => {
              const count = tabCounts[id]
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  onClick={() => selectTab(id)}
                  className={cn(
                    'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                    activeTab === id
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {count > 0 && <span className="text-xs tabular-nums text-gray-400">{count}</span>}
                  {id === 'equipment' && equipmentByStatus.faulty > 0 && (
                    <Badge variant="danger" title={`Неисправно: ${equipmentByStatus.faulty}`}>
                      {equipmentByStatus.faulty}<span className="hidden sm:inline">&nbsp;неиспр.</span>
                    </Badge>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Системы */}
          {activeTab === 'systems' && (
            <Card
              flush
              title="Системы на обслуживании"
              action={
                <Button size="sm" onClick={() => setSystemModal({ open: true, system: null })}>
                  <Plus className="h-4 w-4 mr-1" /> Добавить
                </Button>
              }
            >
              {systems.length === 0 ? (
                <EmptyRow Icon={Wrench} text="Системы не добавлены" />
              ) : (
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>Система</th>
                      <th className="text-right">₽/мес</th>
                      <th>Договор до</th>
                      <th>Статус</th>
                      <th className="w-16" aria-label="Действия" />
                    </tr>
                  </thead>
                  <tbody>
                    {systems.map((system) => {
                      const SystemIcon = systemTypeIcons[system.system_type]
                      const statusConfig = systemStatusConfig[system.status]
                      return (
                        <tr key={system.id} >
                          <td className="w-full min-w-[10rem] max-w-0">
                            <div className="flex items-center gap-2">
                              <SystemIcon className="h-4 w-4 shrink-0 text-gray-400" />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-gray-900 dark:text-white" title={system.name}>{system.name}</p>
                                <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={system.notes || undefined}>
                                  {[systemTypeLabels[system.system_type], system.contract_number && `дог. ${system.contract_number}`, system.notes]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap text-right tabular-nums">
                            {system.monthly_cost ? system.monthly_cost.toLocaleString('ru-RU') : '—'}
                          </td>
                          <td className="whitespace-nowrap">
                            {system.service_end_date ? formatDate(system.service_end_date) : '—'}
                          </td>
                          <td><StatusPill variant={statusConfig.variant}>{statusConfig.label}</StatusPill></td>
                          <td>
                            <RowActions>
                              <IconButton title="Изменить" onClick={() => setSystemModal({ open: true, system })}>
                                <Edit className="h-3.5 w-3.5" />
                              </IconButton>
                              <IconButton danger title="Удалить" onClick={() => setDeleteConfirm({ type: 'system', id: system.id, name: system.name })}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </IconButton>
                            </RowActions>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          )}

          {/* Оборудование и сетевые панели — одна вкладка */}
          {activeTab === 'equipment' && (
            <div className="space-y-3">
            <Card
              flush
              title="Оборудование"
              action={
                <Button size="sm" onClick={() => setEquipmentModal({ open: true, equipment: null })}>
                  <Plus className="h-4 w-4 mr-1" /> Добавить
                </Button>
              }
            >
              {equipment.length === 0 ? (
                <EmptyRow Icon={Package} text="Оборудование не добавлено" />
              ) : (
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>Оборудование</th>
                      <th className="text-right">Кол-во</th>
                      <th>Расположение</th>
                      <th>Статус</th>
                      <th className="w-16" aria-label="Действия" />
                    </tr>
                  </thead>
                  <tbody>
                    {equipment.map((item) => {
                      const ItemIcon = equipmentTypeIcons[item.equipment_type]
                      const statusConfig = equipmentStatusConfig[item.status]
                      const StatusIcon = statusConfig.Icon
                      return (
                        <tr key={item.id} >
                          <td className="w-full min-w-[10rem] max-w-0">
                            <div className="flex items-center gap-2">
                              <ItemIcon className="h-4 w-4 shrink-0 text-gray-400" />
                              <div className="min-w-0">
                                <Link
                                  to={`/equipment/${item.id}`}
                                  className="block truncate font-medium text-primary-600 hover:underline dark:text-primary-400"
                                  title={item.name}
                                >
                                  {item.name}
                                </Link>
                                <p
                                  className="truncate text-xs text-gray-500 dark:text-gray-400"
                                  title={item.serial_number ? `S/N ${item.serial_number}` : undefined}
                                >
                                  {[equipmentTypeLabels[item.equipment_type], item.model, item.serial_number && `S/N ${item.serial_number}`]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="text-right tabular-nums">{item.quantity}</td>
                          <td className="max-w-[10rem] truncate whitespace-nowrap" title={item.location || undefined}>{item.location || '—'}</td>
                          <td>
                            <StatusPill variant={statusConfig.variant}>
                              <StatusIcon className="h-3 w-3" />
                              {statusConfig.label}
                            </StatusPill>
                          </td>
                          <td>
                            <RowActions>
                              <IconButton title="Изменить" onClick={() => setEquipmentModal({ open: true, equipment: item })}>
                                <Edit className="h-3.5 w-3.5" />
                              </IconButton>
                              <IconButton danger title="Удалить" onClick={() => setDeleteConfirm({ type: 'equipment', id: item.id, name: item.name })}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </IconButton>
                            </RowActions>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Card>
            <IntercomPanelsSection addressId={addressId} panels={panels} />
            </div>
          )}

          {/* Документы */}
          {activeTab === 'documents' && (
            <div className="space-y-3">
            <AddressActsCard addressId={addressId} />
            <Card
              flush
              title="Документы объекта"
              action={
                <Button size="sm" onClick={() => setDocumentModal(true)}>
                  <Upload className="h-4 w-4 mr-1" /> Загрузить
                </Button>
              }
            >
              {documents.length === 0 ? (
                <EmptyRow Icon={FileText} text="Документы не добавлены" />
              ) : (
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>Документ</th>
                      <th>Размер</th>
                      <th>Действует до</th>
                      <th>Добавлен</th>
                      <th className="w-16" aria-label="Действия" />
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id} >
                        <td className="w-full min-w-[10rem] max-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-gray-900 dark:text-white" title={doc.name}>{doc.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{documentTypeLabels[doc.doc_type]}</p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap tabular-nums">{formatFileSize(doc.file_size)}</td>
                        <td className="whitespace-nowrap">
                          {doc.valid_until ? (
                            <span className={new Date(doc.valid_until) < new Date() ? 'text-red-500' : ''}>
                              {formatDate(doc.valid_until)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="whitespace-nowrap">{formatDate(doc.created_at)}</td>
                        <td>
                          <RowActions>
                            <IconButton
                              title="Скачать"
                              onClick={() => window.open(addressesApi.getDocumentDownloadUrl(addressId, doc.id), '_blank')}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </IconButton>
                            <IconButton danger title="Удалить" onClick={() => setDeleteConfirm({ type: 'document', id: doc.id, name: doc.name })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconButton>
                          </RowActions>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            </div>
          )}
        </div>
      </div>

      {/* Модальные окна */}
      
      {/* Модалка редактирования адреса */}
      <Modal
        isOpen={addressModal}
        onClose={() => setAddressModal(false)}
        title="Редактировать адрес"
        size="lg"
      >
        {address && (
          <AddressForm
            address={address}
            onSubmit={handleAddressSubmit}
            onCancel={() => setAddressModal(false)}
            isLoading={updateAddress.isPending}
          />
        )}
      </Modal>
      
      {/* Модалка системы */}
      <Modal
        isOpen={systemModal.open}
        onClose={() => setSystemModal({ open: false, system: null })}
        title={systemModal.system ? 'Редактировать систему' : 'Добавить систему'}
        size="lg"
      >
        <SystemForm
          system={systemModal.system || undefined}
          onSubmit={handleSystemSubmit}
          onCancel={() => setSystemModal({ open: false, system: null })}
          isLoading={createSystem.isPending || updateSystem.isPending}
        />
      </Modal>

      {/* Модалка оборудования */}
      <Modal
        isOpen={equipmentModal.open}
        onClose={() => setEquipmentModal({ open: false, equipment: null })}
        title={equipmentModal.equipment ? 'Редактировать оборудование' : 'Добавить оборудование'}
        size="lg"
      >
        <EquipmentForm
          equipment={equipmentModal.equipment || undefined}
          systems={systems}
          onSubmit={handleEquipmentSubmit}
          onCancel={() => setEquipmentModal({ open: false, equipment: null })}
          isLoading={createEquipment.isPending || updateEquipment.isPending}
        />
      </Modal>

      {/* Модалка документа */}
      <Modal
        isOpen={documentModal}
        onClose={() => setDocumentModal(false)}
        title="Загрузить документ"
        size="md"
      >
        <DocumentForm
          onSubmit={handleDocumentSubmit}
          onCancel={() => setDocumentModal(false)}
          isLoading={uploadDocument.isPending}
        />
      </Modal>

      {/* Модалка контакта */}
      <Modal
        isOpen={contactModal.open}
        onClose={() => setContactModal({ open: false, contact: null })}
        title={contactModal.contact ? 'Редактировать контакт' : 'Добавить контакт'}
        size="lg"
      >
        <ContactForm
          contact={contactModal.contact || undefined}
          onSubmit={handleContactSubmit}
          onCancel={() => setContactModal({ open: false, contact: null })}
          isLoading={createContact.isPending || updateContact.isPending}
        />
      </Modal>

      {/* Модалка подтверждения удаления */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Подтверждение удаления"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Вы уверены, что хотите удалить <strong>{deleteConfirm?.name}</strong>?
          </p>
          <p className="text-sm text-red-500">
            Это действие нельзя отменить.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
            >
              Отмена
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={deleteSystem.isPending || deleteEquipment.isPending || deleteDocument.isPending || deleteContact.isPending}
            >
              {(deleteSystem.isPending || deleteEquipment.isPending || deleteDocument.isPending || deleteContact.isPending) 
                ? 'Удаление...' 
                : 'Удалить'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
