import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { operationsApi } from '@/api/operations'
import apiClient from '@/api/client'
import PageHeader from '@/components/PageHeader'
import QueryStatePanel from '@/components/QueryStatePanel'
import StatusBadge from '@/components/StatusBadge'
import Button from '@/components/Button'

export default function EquipmentPassportPage() {
  const id = Number(useParams().id)
  const query = useQuery({ queryKey: ['equipment-passport', id], queryFn: () => operationsApi.passport(id), enabled: id > 0 })
  const [qr, setQr] = useState('')
  const [qrError, setQrError] = useState(false)
  useEffect(() => {
    let active = true
    let objectUrl = ''
    apiClient.get(`/equipment/${id}/qr`, { responseType: 'blob', params: { origin: window.location.origin } }).then(({ data }) => {
      if (active) { objectUrl = URL.createObjectURL(data); setQr(objectUrl) }
    }).catch(() => { if (active) setQrError(true) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [id])
  if (query.isPending) return <QueryStatePanel state="loading" />
  if (query.isError) return <QueryStatePanel state="error" onRetry={() => query.refetch()} />
  const { equipment, address, address_id, tasks } = query.data
  return <div className="space-y-5">
    <PageHeader title={equipment.name} description={address} actions={<Button variant="outline" onClick={() => window.print()}>Печать паспорта</Button>} />
    <div className="flex flex-wrap gap-6 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        <dt>Модель</dt><dd>{equipment.model || '—'}</dd><dt>Серийный номер</dt><dd>{equipment.serial_number || '—'}</dd>
        <dt>Дата установки</dt><dd>{equipment.install_date?.slice(0, 10) || '—'}</dd><dt>Гарантия до</dt><dd>{equipment.warranty_until?.slice(0, 10) || '—'}</dd>
        <dt>Расположение</dt><dd>{equipment.location || '—'}</dd><dt>Примечания</dt><dd className="whitespace-pre-wrap">{equipment.notes || '—'}</dd>
      </dl>
      <div className="text-center">{qr && <><img src={qr} width={180} height={180} alt="QR-код паспорта оборудования" /><a href={qr} download={`equipment-${id}.svg`} className="text-sm text-primary-600 hover:underline">Скачать QR-код</a></>}{qrError && <p role="alert" className="text-sm">QR-код недоступен</p>}</div>
    </div>
    <Link to={`/addresses/${address_id}`} className="inline-block text-sm text-primary-600 hover:underline">Карточка адреса и документы</Link>
    <section><h2 className="mb-3 font-semibold">История обслуживания</h2><ul className="divide-y divide-gray-200 dark:divide-gray-700">{tasks.map((task) => <li key={task.id} className="flex items-center justify-between gap-3 py-3"><Link className="text-primary-600 hover:underline" to={`/tasks/${task.id}`}>{task.task_number} · {task.title}</Link><StatusBadge status={task.status} /></li>)}</ul>{tasks.length === 0 && <p className="text-sm text-gray-500">Связанных работ пока нет. Оборудование можно привязать в карточке заявки или расписании обслуживания.</p>}</section>
  </div>
}
