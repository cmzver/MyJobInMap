import { useState } from 'react'
import { ListChecks, Plus, Trash2 } from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Select from '@/components/Select'
import { SettingsCard } from '@/components/settings/SettingsSection'
import { useCatalogMutations, useServiceCatalog } from '@/hooks/useActs'
import type { CatalogItem } from '@/api/acts'
import type { Material } from '@/api/materials'
import { useMaterialCatalog } from '@/hooks/useMaterials'
import { LINE_TYPE_OPTIONS } from '@/components/acts/actLabels'
import { showApiError } from '@/utils/apiError'

const EMPTY = { name: '', unit: 'шт', price: '', line_type: 'work' }

function CatalogRow({ item, materials }: { item: CatalogItem; materials: Material[] }) {
  const { update, remove } = useCatalogMutations()
  const [price, setPrice] = useState(String(item.price ?? 0))

  const savePrice = () => {
    const value = Number(price.replace(',', '.'))
    if (!Number.isFinite(value) || value === item.price) return
    update.mutate(
      { id: item.id, item: { price: value } },
      { onError: (error) => showApiError(error, 'Не удалось сохранить цену') },
    )
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${item.is_active ? 'text-gray-900 dark:text-white' : 'text-gray-400 line-through'}`}>
          {item.name}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {item.line_type === 'material' ? 'материал' : 'работа'} · {item.unit}
        </p>
      </div>
      {item.line_type === 'material' && (
        <select
          aria-label={`Склад: ${item.name}`}
          title="Позиция склада: по акту материал списывается у исполнителя"
          className="field h-8 w-48"
          value={item.material_id ?? ''}
          onChange={(event) =>
            update.mutate(
              { id: item.id, item: { material_id: event.target.value ? Number(event.target.value) : null } },
              { onError: (error) => showApiError(error, 'Не удалось связать со складом') },
            )
          }
        >
          <option value="">Не со склада</option>
          {materials.map((material) => (
            <option key={material.id} value={material.id}>
              {material.name} ({material.unit})
            </option>
          ))}
        </select>
      )}
      <div className="w-28">
        <Input
          aria-label={`Цена: ${item.name}`}
          inputMode="decimal"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          onBlur={savePrice}
        />
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => update.mutate({ id: item.id, item: { is_active: !item.is_active } })}
      >
        {item.is_active ? 'Скрыть' : 'Вернуть'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Удалить: ${item.name}`}
        onClick={() =>
          remove.mutate(item.id, { onError: (error) => showApiError(error, 'Не удалось удалить') })
        }
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  )
}

/** Прайс-лист организации: подставляется в строки актов. */
export default function ServiceCatalogCard() {
  const { data: items = [], isLoading } = useServiceCatalog(true)
  const { data: materials = [] } = useMaterialCatalog()
  const { create } = useCatalogMutations()
  const [draft, setDraft] = useState(EMPTY)

  const add = () =>
    create.mutate(
      {
        name: draft.name.trim(),
        unit: draft.unit.trim() || 'шт',
        price: Number(draft.price.replace(',', '.')) || 0,
        line_type: draft.line_type as CatalogItem['line_type'],
        is_active: true,
        sort_order: items.length,
      },
      {
        onSuccess: () => setDraft(EMPTY),
        onError: (error) => showApiError(error, 'Не удалось добавить позицию'),
      },
    )

  return (
    <SettingsCard
      title="Прайс-лист"
      icon={ListChecks}
      description="Работы и материалы с ценой по умолчанию — подставляются в акты; цену в акте можно поменять. Материал, связанный со складом, списывается у исполнителя по акту."
    >
      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Загружаем…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Прайс пуст.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {items.map((item) => (
            <CatalogRow key={`${item.id}-${item.price}`} item={item} materials={materials} />
          ))}
        </ul>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_8rem_5rem_7rem_auto] md:items-end">
        <div className="col-span-2 md:col-span-1">
          <Input label="Новая позиция" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </div>
        <Select
          label="Тип"
          options={LINE_TYPE_OPTIONS}
          value={draft.line_type}
          onChange={(value) => setDraft({ ...draft, line_type: value })}
        />
        <Input label="Ед." value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} />
        <Input
          label="Цена, ₽"
          inputMode="decimal"
          value={draft.price}
          onChange={(event) => setDraft({ ...draft, price: event.target.value })}
        />
        <Button disabled={!draft.name.trim()} isLoading={create.isPending} onClick={add}>
          <Plus className="mr-1 h-4 w-4" />
          Добавить
        </Button>
      </div>
    </SettingsCard>
  )
}
