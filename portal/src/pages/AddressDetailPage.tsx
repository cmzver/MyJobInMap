import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { 
  ArrowLeft, 
  MapPin, 
  Building2, 
  FileText, 
  Wrench, 
  Package, 
  Users, 
  ClipboardList,
  History,
  Phone,
  Mail,
  DollarSign,
  Plus,
  Edit,
  Trash2,
  Download,
  Eye,
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
  Zap
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
import Button from '@/components/Button'
import Card from '@/components/Card'
import Spinner from '@/components/Spinner'
import Modal from '@/components/Modal'
import { SystemForm, EquipmentForm, DocumentForm, ContactForm, AddressForm } from '@/components/AddressCardForms'
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
const systemStatusConfig: Record<SystemStatus, { label: string; color: string; bg: string }> = {
  active: { label: 'Активна', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
  maintenance: { label: 'На ремонте', color: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  disabled: { label: 'Отключена', color: 'text-gray-700 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-900/30' },
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
const equipmentStatusConfig: Record<EquipmentStatus, { label: string; color: string; bg: string; Icon: typeof CheckCircle }> = {
  working: { label: 'Работает', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', Icon: CheckCircle },
  faulty: { label: 'Неисправно', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', Icon: AlertCircle },
  dismantled: { label: 'Демонтировано', color: 'text-gray-700 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-900/30', Icon: XCircle },
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

type TabType = 'info' | 'systems' | 'equipment' | 'documents' | 'contacts' | 'tasks' | 'history'

const tabs: { id: TabType; label: string; Icon: typeof Building2 }[] = [
  { id: 'info', label: 'Информация', Icon: Building2 },
  { id: 'systems', label: 'Системы', Icon: Wrench },
  { id: 'equipment', label: 'Оборудование', Icon: Package },
  { id: 'documents', label: 'Документы', Icon: FileText },
  { id: 'contacts', label: 'Контакты', Icon: Users },
  { id: 'tasks', label: 'Заявки', Icon: ClipboardList },
  { id: 'history', label: 'История', Icon: History },
]

// Форматирование размера файла
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' Б'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ'
  return (bytes / (1024 * 1024)).toFixed(1) + ' МБ'
}

// Форматирование даты
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('ru-RU')
}

export default function AddressDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const addressId = Number(id)
  
  const [activeTab, setActiveTab] = useState<TabType>('info')
  
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
  const documents = addressFull?.documents || []
  const contacts = addressFull?.contacts || []
  const taskStats = addressFull?.task_stats || { total: 0, new: 0, in_progress: 0, done: 0, cancelled: 0 }
  
  // Обработчик редактирования адреса
  const handleAddressSubmit = async (data: any) => {
    try {
      const payload = {
        ...data,
        entrance_count: data.entrance_count ? parseInt(data.entrance_count) : null,
        floor_count: data.floor_count ? parseInt(data.floor_count) : null,
        apartment_count: data.apartment_count ? parseInt(data.apartment_count) : null,
      }
      
      await updateAddress.mutateAsync({ id: addressId, data: payload })
      toast.success('Адрес обновлён')
      setAddressModal(false)
    } catch (err) {
      toast.error('Ошибка сохранения адреса')
    }
  }
  
  // Обработчики систем
  const handleSystemSubmit = async (data: any) => {
    try {
      const payload = {
        ...data,
        monthly_cost: data.monthly_cost ? parseFloat(data.monthly_cost) : undefined,
        service_start_date: data.service_start_date || undefined,
        service_end_date: data.service_end_date || undefined,
      }
      
      if (systemModal.system) {
        await updateSystem.mutateAsync({ systemId: systemModal.system.id, data: payload })
        toast.success('Система обновлена')
      } else {
        await createSystem.mutateAsync(payload)
        toast.success('Система добавлена')
      }
      setSystemModal({ open: false, system: null })
    } catch (err) {
      toast.error('Ошибка сохранения системы')
    }
  }
  
  // Обработчики оборудования
  const handleEquipmentSubmit = async (data: any) => {
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
        toast.success('Оборудование обновлено')
      } else {
        await createEquipment.mutateAsync(payload)
        toast.success('Оборудование добавлено')
      }
      setEquipmentModal({ open: false, equipment: null })
    } catch (err) {
      toast.error('Ошибка сохранения оборудования')
    }
  }
  
  // Обработчики документов
  const handleDocumentSubmit = async (data: any) => {
    try {
      await uploadDocument.mutateAsync({
        file: data.file,
        docType: data.doc_type,
        name: data.name,
        validFrom: data.valid_from || undefined,
        validUntil: data.valid_until || undefined,
        notes: data.notes || undefined,
      })
      toast.success('Документ загружен')
      setDocumentModal(false)
    } catch (err) {
      toast.error('Ошибка загрузки документа')
    }
  }
  
  // Обработчики контактов
  const handleContactSubmit = async (data: any) => {
    try {
      if (contactModal.contact) {
        await updateContact.mutateAsync({ contactId: contactModal.contact.id, data })
        toast.success('Контакт обновлён')
      } else {
        await createContact.mutateAsync(data)
        toast.success('Контакт добавлен')
      }
      setContactModal({ open: false, contact: null })
    } catch (err) {
      toast.error('Ошибка сохранения контакта')
    }
  }
  
  // Обработчик удаления
  const handleDelete = async () => {
    if (!deleteConfirm) return
    
    try {
      switch (deleteConfirm.type) {
        case 'system':
          await deleteSystem.mutateAsync(deleteConfirm.id)
          toast.success('Система удалена')
          break
        case 'equipment':
          await deleteEquipment.mutateAsync(deleteConfirm.id)
          toast.success('Оборудование удалено')
          break
        case 'document':
          await deleteDocument.mutateAsync(deleteConfirm.id)
          toast.success('Документ удалён')
          break
        case 'contact':
          await deleteContact.mutateAsync(deleteConfirm.id)
          toast.success('Контакт удалён')
          break
      }
      setDeleteConfirm(null)
    } catch (err) {
      toast.error('Ошибка удаления')
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
  const totalMonthlyCost = systems.reduce((sum, s) => sum + ((s as any).monthly_cost || 0), 0)
  
  // Подсчёт оборудования по статусам
  const equipmentByStatus = {
    working: equipment.filter(e => e.status === 'working').length,
    faulty: equipment.filter(e => e.status === 'faulty').length,
    dismantled: equipment.filter(e => e.status === 'dismantled').length,
  }

  return (
    <div className="p-6 space-y-6">
      {/* Заголовок */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/addresses')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <MapPin className="h-6 w-6 text-blue-500" />
              {address.address}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Карточка объекта
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddressModal(true)}>
            <Edit className="h-4 w-4 mr-2" />
            Редактировать
          </Button>
          {address.lat && address.lon && (
            <Button 
              variant="outline"
              onClick={() => window.open(`https://yandex.ru/maps/?pt=${address.lon},${address.lat}&z=17`, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              На карте
            </Button>
          )}
        </div>
      </div>

      {/* Метрики */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Систем</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{systems.length}</p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Wrench className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Оборудование</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{equipment.length}</p>
              {equipmentByStatus.faulty > 0 && (
                <p className="text-xs text-red-500">{equipmentByStatus.faulty} неисправно</p>
              )}
            </div>
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Package className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Заявок всего</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{taskStats.total}</p>
              {(taskStats.new + taskStats.in_progress) > 0 && (
                <p className="text-xs text-orange-500">{taskStats.new + taskStats.in_progress} активных</p>
              )}
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <ClipboardList className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Абонплата</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {totalMonthlyCost.toLocaleString('ru-RU')} ₽
              </p>
              <p className="text-xs text-gray-400">в месяц</p>
            </div>
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <DollarSign className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Табы */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4 overflow-x-auto pb-px">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${activeTab === id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                }
              `}
            >
              <Icon className="h-4 w-4" />
              {label}
              {id === 'systems' && systems.length > 0 && (
                <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full">
                  {systems.length}
                </span>
              )}
              {id === 'equipment' && equipment.length > 0 && (
                <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full">
                  {equipment.length}
                </span>
              )}
              {id === 'documents' && documents.length > 0 && (
                <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full">
                  {documents.length}
                </span>
              )}
              {id === 'tasks' && (taskStats.new + taskStats.in_progress) > 0 && (
                <span className="px-2 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full">
                  {taskStats.new + taskStats.in_progress}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Контент табов */}
      <div className="min-h-[400px]">
        {/* Информация */}
        {activeTab === 'info' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Основная информация">
              <dl className="space-y-4">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Город</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">{address.city || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Улица</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">{address.street || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Дом</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">
                    {address.building || '—'}
                    {address.corpus && ` корп. ${address.corpus}`}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card title="Информация о здании">
              <dl className="space-y-4">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Подъездов</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">{address.entrance_count || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Этажей</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">{address.floor_count || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Квартир</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">{address.apartment_count || '—'}</dd>
                </div>
              </dl>
            </Card>

            <Card title="Дополнительная информация">
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {/* TODO: Добавить поле extra_info в модель Address */}
                Здесь можно указать любую дополнительную информацию об объекте: особенности доступа, время работы, контактные данные охраны и т.д.
              </p>
            </Card>

            <Card title="Управляющая компания">
              <dl className="space-y-4">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Название</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">{address.management_company || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">Телефон</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">
                    {address.management_phone ? (
                      <a href={`tel:${address.management_phone}`} className="text-blue-500 hover:underline">
                        {address.management_phone}
                      </a>
                    ) : '—'}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card title="Заметки">
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {address.notes || 'Нет заметок'}
              </p>
            </Card>
          </div>
        )}

        {/* Системы */}
        {activeTab === 'systems' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Системы на обслуживании
              </h3>
              <Button onClick={() => setSystemModal({ open: true, system: null })}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить систему
              </Button>
            </div>
            
            {systems.length === 0 ? (
              <Card className="p-8 text-center">
                <Wrench className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">Системы не добавлены</p>
              </Card>
            ) : (
              <div className="grid gap-4">
                {systems.map((system) => {
                  const SystemIcon = systemTypeIcons[system.system_type]
                  const statusConfig = systemStatusConfig[system.status]
                  
                  return (
                    <Card key={system.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-lg ${statusConfig.bg}`}>
                            <SystemIcon className={`h-6 w-6 ${statusConfig.color}`} />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 dark:text-white">
                              {system.name}
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {systemTypeLabels[system.system_type]}
                              {system.contract_number && ` • Договор: ${system.contract_number}`}
                            </p>
                            <div className="flex flex-wrap gap-4 mt-2 text-sm">
                              <span className={`px-2 py-0.5 rounded ${statusConfig.bg} ${statusConfig.color}`}>
                                {statusConfig.label}
                              </span>
                              {system.monthly_cost && (
                                <span className="text-gray-500 dark:text-gray-400">
                                  {system.monthly_cost.toLocaleString('ru-RU')} ₽/мес
                                </span>
                              )}
                              {system.service_end_date && (
                                <span className="text-gray-500 dark:text-gray-400">
                                  До: {formatDate(system.service_end_date)}
                                </span>
                              )}
                            </div>
                            {system.notes && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                                {system.notes}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setSystemModal({ open: true, system })}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm({ type: 'system', id: system.id, name: system.name })}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Оборудование */}
        {activeTab === 'equipment' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Список оборудования
              </h3>
              <Button onClick={() => setEquipmentModal({ open: true, equipment: null })}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить оборудование
              </Button>
            </div>
            
            {equipment.length === 0 ? (
              <Card className="p-8 text-center">
                <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">Оборудование не добавлено</p>
              </Card>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Тип</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Название</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Модель</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Кол-во</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Расположение</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Статус</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipment.map((item) => {
                      const ItemIcon = equipmentTypeIcons[item.equipment_type]
                      const statusConfig = equipmentStatusConfig[item.status]
                      const StatusIcon = statusConfig.Icon
                      
                      return (
                        <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <ItemIcon className="h-4 w-4 text-gray-400" />
                              <span className="text-sm text-gray-600 dark:text-gray-300">
                                {equipmentTypeLabels[item.equipment_type]}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
                            {item.serial_number && (
                              <p className="text-xs text-gray-400">S/N: {item.serial_number}</p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                            {item.model || '—'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                              {item.quantity}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                            {item.location || '—'}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${statusConfig.bg} ${statusConfig.color}`}>
                              <StatusIcon className="h-3 w-3" />
                              {statusConfig.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setEquipmentModal({ open: true, equipment: item })}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm({ type: 'equipment', id: item.id, name: item.name })}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Документы */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Документы объекта
              </h3>
              <Button onClick={() => setDocumentModal(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Загрузить документ
              </Button>
            </div>
            
            {documents.length === 0 ? (
              <Card className="p-8 text-center">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">Документы не добавлены</p>
              </Card>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Название</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Тип</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Размер</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Действует до</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Добавлен</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-500" />
                            <span className="font-medium text-gray-900 dark:text-white" title={doc.name}>
                              {doc.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                          {documentTypeLabels[doc.doc_type]}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                          {formatFileSize(doc.file_size)}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                          {doc.valid_until ? (
                            <span className={new Date(doc.valid_until) < new Date() ? 'text-red-500' : ''}>
                              {formatDate(doc.valid_until)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(doc.created_at)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" title="Открыть">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              title="Скачать"
                              onClick={() => window.open(addressesApi.getDocumentDownloadUrl(addressId, doc.id), '_blank')}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Удалить" onClick={() => setDeleteConfirm({ type: 'document', id: doc.id, name: doc.name })}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Контакты */}
        {activeTab === 'contacts' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Контакты
              </h3>
              <Button onClick={() => setContactModal({ open: true, contact: null })}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить контакт
              </Button>
            </div>
            
            {contacts.length === 0 ? (
              <Card className="p-8 text-center">
                <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">Контакты не добавлены</p>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {contacts.map((contact) => (
                  <Card key={contact.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                          <Users className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-gray-900 dark:text-white">
                              {contact.name}
                            </h4>
                            {contact.is_primary && (
                              <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                                Основной
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {contactTypeLabels[contact.contact_type]}
                          </p>
                          <div className="mt-2 space-y-1">
                            {contact.phone && (
                              <a 
                                href={`tel:${contact.phone}`}
                                className="flex items-center gap-2 text-sm text-blue-500 hover:underline"
                              >
                                <Phone className="h-3 w-3" />
                                {contact.phone}
                              </a>
                            )}
                            {contact.email && (
                              <a 
                                href={`mailto:${contact.email}`}
                                className="flex items-center gap-2 text-sm text-blue-500 hover:underline"
                              >
                                <Mail className="h-3 w-3" />
                                {contact.email}
                              </a>
                            )}
                          </div>
                          {contact.notes && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                              {contact.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setContactModal({ open: true, contact })}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm({ type: 'contact', id: contact.id, name: contact.name })}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Заявки */}
        {activeTab === 'tasks' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Заявки по объекту
              </h3>
              <Link to={`/tasks/new?address=${encodeURIComponent(address.address)}`}>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Создать заявку
                </Button>
              </Link>
            </div>
            
            {/* Статистика заявок */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Card className="p-3 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{taskStats.total}</p>
                <p className="text-xs text-gray-500">Всего</p>
              </Card>
              <Card className="p-3 text-center border-l-4 border-red-500">
                <p className="text-2xl font-bold text-red-600">{taskStats.new}</p>
                <p className="text-xs text-gray-500">Новых</p>
              </Card>
              <Card className="p-3 text-center border-l-4 border-orange-500">
                <p className="text-2xl font-bold text-orange-600">{taskStats.in_progress}</p>
                <p className="text-xs text-gray-500">В работе</p>
              </Card>
              <Card className="p-3 text-center border-l-4 border-green-500">
                <p className="text-2xl font-bold text-green-600">{taskStats.done}</p>
                <p className="text-xs text-gray-500">Выполнено</p>
              </Card>
              <Card className="p-3 text-center border-l-4 border-gray-500">
                <p className="text-2xl font-bold text-gray-600">{taskStats.cancelled}</p>
                <p className="text-xs text-gray-500">Отменено</p>
              </Card>
            </div>

            {/* Ссылка на все заявки */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-gray-600 dark:text-gray-300">
                  Для просмотра всех заявок по этому адресу перейдите в раздел заявок с фильтром
                </p>
                <Link to={`/tasks?search=${encodeURIComponent(address.address)}`}>
                  <Button variant="outline">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Показать заявки
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        )}

        {/* История */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              История изменений
            </h3>
            
            <Card className="p-8 text-center">
              <History className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                История изменений будет доступна после реализации бэкенда
              </p>
            </Card>
          </div>
        )}
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
