import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { mutationToast } from '@/utils/apiError'
import { 
  MapPin, 
  Plus, 
  Search, 
  Trash2, 
  Building2,
  X,
  Check,
  Home,
  Layers,
  DoorOpen,
  Eye
} from 'lucide-react'
import { 
  useAddresses, 
  useDeleteAddress 
} from '@/hooks/useAddresses'
import Button from '@/components/Button'
import PageHeader from '@/components/PageHeader'
import Card from '@/components/Card'
import Spinner from '@/components/Spinner'
import Pagination from '@/components/Pagination'
import EmptyState from '@/components/EmptyState'
import AddressCreateModal from '@/components/addresses/AddressCreateModal'

export default function AddressesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reset page on search
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // Query
  const { data, isLoading, isError } = useAddresses({
    search: debouncedSearch || undefined,
    page,
    size: 20,
  })

  // Mutations
  const deleteMutation = useDeleteAddress()

  const handleOpenCreate = () => setShowModal(true)
  const handleCloseModal = () => setShowModal(false)

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, mutationToast({
      success: 'Адрес удалён',
      error: 'Ошибка удаления',
      onSuccess: () => setDeleteConfirm(null),
    }))
  }

  return (
    <div>
      {/* Header */}
      <PageHeader
        className="mb-6"
        title="База адресов"
        description="Управление адресами и информацией о зданиях"
        actions={
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить адрес
          </Button>
        }
      />

      {/* Search */}
      <div className="mb-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            aria-label="Поиск по адресу"
            type="text"
            placeholder="Адрес или район…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="field pl-9"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <Card>
          <div className="text-center py-8 text-red-500">
            Ошибка загрузки данных
          </div>
        </Card>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Адреса не найдены"
          description={search ? 'Попробуйте изменить поисковый запрос' : 'Добавьте первый адрес в базу'}
          action={
            !search && (
              <Button onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить адрес
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          {/* List (table) */}
          <div className="data-table-wrap">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>Адрес</th>
                  <th>Координаты</th>
                  <th>Подъезды / Этажи</th>
                  <th>УК</th>
                  <th className="text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((address) => (
                  <tr 
                    key={address.id} className="cursor-pointer"
                    onClick={() => navigate(`/addresses/${address.id}`)}
                  >
                    {/* Адрес */}
                    <td>
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-primary-500 mt-0.5" />
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 dark:text-white truncate hover:text-primary-600 dark:hover:text-primary-400">
                            {address.address}
                          </div>
                          {(address.city || address.district) && (
                            // Строка выше — уже адрес; здесь — где он: город и район
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {[address.city, address.district].filter(Boolean).join(' · ')}
                            </div>
                          )}
                          {address.notes && (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{address.notes}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Координаты */}
                    <td>
                      {address.lat && address.lon ? (
                        <span>{address.lat.toFixed(4)}, {address.lon.toFixed(4)}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Подъезды / Этажи */}
                    <td>
                      <div className="flex items-center gap-4">
                        <span className="inline-flex items-center gap-1">
                          <DoorOpen className="h-4 w-4 text-gray-500" />
                          {address.entrance_count ?? 1}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Layers className="h-4 w-4 text-gray-500" />
                          {address.floor_count ?? 1}
                        </span>
                        {address.apartment_count ? (
                          <span className="inline-flex items-center gap-1">
                            <Home className="h-4 w-4 text-gray-500" />
                            {address.apartment_count}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* УК */}
                    <td>
                      {address.management_company ? (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-4 w-4 text-gray-500" />
                          <span className="truncate max-w-[220px] inline-block">{address.management_company}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Действия */}
                    <td>
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {deleteConfirm === address.id ? (
                          <>
                            <Button
                              aria-label="Подтвердить удаление"
                              variant="danger"
                              size="sm"
                              onClick={() => handleDelete(address.id)}
                              isLoading={deleteMutation.isPending}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              aria-label="Отменить удаление"
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirm(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/addresses/${address.id}`)}
                              title="Открыть карточку"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirm(address.id)}
                              title="Удалить"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex justify-center">
              <Pagination
                currentPage={page}
                totalPages={data.pages}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}

      <AddressCreateModal
        isOpen={showModal}
        onClose={handleCloseModal}
      />
    </div>
  )
}
