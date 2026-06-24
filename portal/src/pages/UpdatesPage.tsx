import { useState, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { Upload, Trash2, Download, Smartphone, RefreshCw, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import Button from '@/components/Button'
import Spinner from '@/components/Spinner'
import EmptyState from '@/components/EmptyState'
import Modal from '@/components/Modal'
import Textarea from '@/components/Textarea'
import PageHeader from '@/components/PageHeader'
import { SettingsCard, StatRow, SettingsIconButton } from '@/components/settings/SettingsSection'
import { settingsTokens } from '@/components/settings/tokens'
import Badge from '@/components/Badge'
import { useUpdates, useUploadUpdate, useDeleteUpdate } from '@/hooks/useUpdates'
import { getApiErrorMessage } from '@/utils/apiError'
import { getAdminSettingsPath } from '@/utils/adminSettingsTabs'
import { formatDateTime } from '@/utils/dateFormat'
import type { AppUpdate } from '@/api/updates'

const MAX_APK_SIZE_BYTES = 100 * 1024 * 1024

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

interface UpdatesManagementSectionProps {
  embedded?: boolean
}

export function UpdatesManagementSection({ embedded = false }: UpdatesManagementSectionProps) {
  const { data: updates, isLoading, refetch, isFetching } = useUpdates()
  const uploadMutation = useUploadUpdate()
  const deleteMutation = useDeleteUpdate()

  const [showUploadModal, setShowUploadModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AppUpdate | null>(null)

  // Form state
  const [releaseNotes, setReleaseNotes] = useState('')
  const [isMandatory, setIsMandatory] = useState(false)
  const [apkFile, setApkFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const latestUpdate = updates?.[0] ?? null

  const resetForm = () => {
    setReleaseNotes('')
    setIsMandatory(false)
    setApkFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleUpload = async () => {
    if (!apkFile) {
      toast.error('Выберите APK файл')
      return
    }

    if (!apkFile.name.toLowerCase().endsWith('.apk')) {
      toast.error('Можно загружать только APK файл')
      return
    }

    if (apkFile.size > MAX_APK_SIZE_BYTES) {
      toast.error('Размер APK превышает 100 МБ')
      return
    }

    const formData = new FormData()
    formData.append('file', apkFile)
    formData.append('release_notes', releaseNotes)
    formData.append('is_mandatory', String(isMandatory))

    try {
      const uploaded = await uploadMutation.mutateAsync(formData)
      toast.success(`Версия ${uploaded.version_name} (code ${uploaded.version_code}) загружена`)
      setShowUploadModal(false)
      resetForm()
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.version_code)
      toast.success(`Версия ${deleteTarget.version_name} удалена`)
      setDeleteTarget(null)
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className={settingsTokens.stack}>
      {!embedded && (
        <PageHeader
          title="Обновления приложения"
          description="Управление версиями Android-приложения"
          actions={
            <>
              <Button variant="ghost" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
              <Button onClick={() => setShowUploadModal(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Загрузить APK
              </Button>
            </>
          }
        />
      )}

      {embedded && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={() => setShowUploadModal(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Загрузить APK
          </Button>
        </div>
      )}

      {/* Stats */}
      {updates && updates.length > 0 && (
        <SettingsCard title="Сводка" icon={Smartphone}>
          <div>
            <StatRow label="Всего версий" value={updates.length} />
            <StatRow label="Обязательных обновлений" value={updates.filter((u) => u.is_mandatory).length} />
            <StatRow label="Endpoint публикации" value={latestUpdate?.download_url ?? '/api/updates/download'} mono />
          </div>
        </SettingsCard>
      )}

      {latestUpdate && (
        <SettingsCard title="Текущий релиз" icon={Download}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Текущая публикуемая версия: v{latestUpdate.version_name} (code {latestUpdate.version_code})
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Android-клиент получает обновление через проверку {`/api/updates/check`} и скачивает APK по адресу {latestUpdate.download_url}.
              </p>
            </div>
            <a
              href="/api/updates/download"
              className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              Скачать актуальный APK
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </SettingsCard>
      )}

      {/* Table */}
      {!updates || updates.length === 0 ? (
        <SettingsCard title="Версии" icon={Smartphone}>
          <EmptyState
            icon={Smartphone}
            title="Нет загруженных обновлений"
            description="Загрузите APK файл для распространения обновлений"
          />
        </SettingsCard>
      ) : (
        <SettingsCard title="Версии" icon={Smartphone} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 dark:bg-gray-800/60">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Версия</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Код</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Размер</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Тип</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Описание</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Дата</th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Действия</th>
                </tr>
              </thead>
              <tbody>
                {updates.map((update) => (
                  <tr
                    key={update.version_code}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-1.5 font-medium text-gray-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <span>v{update.version_name}</span>
                        {latestUpdate?.version_code === update.version_code && (
                          <Badge variant="info">Последняя</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-1.5 text-gray-600 dark:text-gray-300">
                      {update.version_code}
                    </td>
                    <td className="px-4 py-1.5 text-gray-600 dark:text-gray-300">
                      {formatFileSize(update.file_size)}
                    </td>
                    <td className="px-4 py-1.5">
                      {update.is_mandatory ? (
                        <Badge variant="danger">Обязательное</Badge>
                      ) : (
                        <Badge variant="gray">Обычное</Badge>
                      )}
                    </td>
                    <td className="px-4 py-1.5 text-gray-600 dark:text-gray-300 max-w-[200px] truncate">
                      {update.release_notes || '—'}
                    </td>
                    <td className="px-4 py-1.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {formatDateTime(update.created_at)}
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {latestUpdate?.version_code === update.version_code ? (
                          <a
                            href="/api/updates/download"
                            className="rounded p-1 text-gray-400 transition-colors hover:text-primary-500 dark:text-gray-500 dark:hover:text-primary-400"
                            title="Скачать APK"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span
                            className="p-1 text-gray-300 dark:text-gray-600"
                            title="Сервер отдаёт только последнюю опубликованную версию"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </span>
                        )}
                        <SettingsIconButton title="Удалить" tone="danger" onClick={() => setDeleteTarget(update)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </SettingsIconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
            Для скачивания доступна только последняя опубликованная версия, потому что серверный endpoint {`/api/updates/download`} всегда отдаёт актуальный APK.
          </div>
        </SettingsCard>
      )}

      {/* Upload Modal */}
      <Modal
        isOpen={showUploadModal}
        onClose={() => { setShowUploadModal(false); resetForm() }}
        title="Загрузить обновление"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-800 dark:border-primary-900/40 dark:bg-primary-950/30 dark:text-primary-200">
              versionName и versionCode будут автоматически извлечены из AndroidManifest.xml внутри выбранного APK.
            </div>
          </div>

          {latestUpdate && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Текущий опубликованный релиз: v{latestUpdate.version_name} с code {latestUpdate.version_code}. APK должен содержать более высокий versionCode.
            </p>
          )}

          <Textarea
            label="Описание изменений"
            placeholder="Что нового в этой версии..."
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            rows={3}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              APK файл *
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".apk"
              onChange={(e) => setApkFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-500 dark:text-gray-400
                file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
                file:text-sm file:font-medium
                file:bg-primary-50 file:text-primary-700 dark:file:bg-primary-900/30 dark:file:text-primary-400
                file:cursor-pointer hover:file:bg-primary-100 dark:hover:file:bg-primary-900/50"
            />
            {apkFile && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {apkFile.name} ({formatFileSize(apkFile.size)})
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Допустим только файл .apk размером до 100 МБ.
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isMandatory}
              onChange={(e) => setIsMandatory(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Обязательное обновление
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => { setShowUploadModal(false); resetForm() }}
            >
              Отмена
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploadMutation.isPending || !apkFile}
            >
              {uploadMutation.isPending ? (
                <>
                  <Spinner size="sm" />
                  <span className="ml-2">Загрузка...</span>
                </>
              ) : (
                'Загрузить'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Удалить обновление"
      >
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300">
            Вы уверены, что хотите удалить версию{' '}
            <strong>v{deleteTarget?.version_name}</strong> (код {deleteTarget?.version_code})?
          </p>
          <p className="text-sm text-red-600 dark:text-red-400">
            APK файл будет удалён с сервера. Это действие необратимо.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function UpdatesPage() {
  return <Navigate to={getAdminSettingsPath('updates')} replace />
}
