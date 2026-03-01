import { useState, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  Settings2,
  AlertTriangle,
  Clock,
  X,
  Search,
  Copy,
  ChevronDown,
  ChevronRight,
  Check,
} from 'lucide-react'
import { db } from '../db/database'
import type { StorageItem, StorageArea, StorageSection, StorageCategory } from '../db/models'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { EmojiSelect } from '../components/ui/EmojiSelect'

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES: StorageCategory[] = [
  'spare_parts', 'tools', 'rigging', 'safety',
  'food', 'beverages', 'medicine', 'navigation',
  'electronics', 'clothing', 'documents', 'other',
]

const UNITS = ['Stk', 'kg', 'g', 'l', 'ml', 'm', 'Paar', 'Dose', 'Flasche', 'Packung', 'Rolle', 'Tube', 'Box', 'Set']

const CAT_EMOJI: Record<string, string> = {
  spare_parts:  '🔩',
  tools:        '🔧',
  rigging:      '⛵',
  safety:       '🦺',
  food:         '🍎',
  beverages:    '🥤',
  medicine:     '💊',
  navigation:   '🧭',
  electronics:  '📡',
  clothing:     '👕',
  documents:    '📄',
  other:        '📦',
}

const COLOR_OPTIONS = ['slate', 'blue', 'amber', 'green', 'red', 'purple', 'pink', 'teal', 'indigo', 'orange']

// Full Tailwind strings so JIT keeps them
const COLOR_DOT: Record<string, string> = {
  slate:  'bg-slate-400',
  blue:   'bg-blue-500',
  amber:  'bg-amber-500',
  green:  'bg-green-500',
  red:    'bg-red-500',
  purple: 'bg-purple-500',
  pink:   'bg-pink-500',
  teal:   'bg-teal-500',
  indigo: 'bg-indigo-500',
  orange: 'bg-orange-500',
}

const AREA_BADGE: Record<string, string> = {
  slate:  'border-slate-400  bg-slate-50  dark:bg-slate-900/50  text-slate-800  dark:text-slate-200',
  blue:   'border-blue-500   bg-blue-50   dark:bg-blue-950/50   text-blue-800   dark:text-blue-200',
  amber:  'border-amber-500  bg-amber-50  dark:bg-amber-950/50  text-amber-800  dark:text-amber-200',
  green:  'border-green-500  bg-green-50  dark:bg-green-950/50  text-green-800  dark:text-green-200',
  red:    'border-red-500    bg-red-50    dark:bg-red-950/50    text-red-800    dark:text-red-200',
  purple: 'border-purple-500 bg-purple-50 dark:bg-purple-950/50 text-purple-800 dark:text-purple-200',
  pink:   'border-pink-500   bg-pink-50   dark:bg-pink-950/50   text-pink-800   dark:text-pink-200',
  teal:   'border-teal-500   bg-teal-50   dark:bg-teal-950/50   text-teal-800   dark:text-teal-200',
  indigo: 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-200',
  orange: 'border-orange-500 bg-orange-50 dark:bg-orange-950/50 text-orange-800 dark:text-orange-200',
}

const AREA_HEADER: Record<string, string> = {
  slate:  'bg-slate-500  dark:bg-slate-600',
  blue:   'bg-blue-600   dark:bg-blue-700',
  amber:  'bg-amber-500  dark:bg-amber-600',
  green:  'bg-green-600  dark:bg-green-700',
  red:    'bg-red-600    dark:bg-red-700',
  purple: 'bg-purple-600 dark:bg-purple-700',
  pink:   'bg-pink-500   dark:bg-pink-600',
  teal:   'bg-teal-600   dark:bg-teal-700',
  indigo: 'bg-indigo-600 dark:bg-indigo-700',
  orange: 'bg-orange-500 dark:bg-orange-600',
}

const ITEM_BADGE: Record<string, string> = {
  slate:  'bg-slate-100  text-slate-700  dark:bg-slate-800  dark:text-slate-300',
  blue:   'bg-blue-100   text-blue-700   dark:bg-blue-900/40  dark:text-blue-300',
  amber:  'bg-amber-100  text-amber-700  dark:bg-amber-900/40 dark:text-amber-300',
  green:  'bg-green-100  text-green-700  dark:bg-green-900/40 dark:text-green-300',
  red:    'bg-red-100    text-red-700    dark:bg-red-900/40   dark:text-red-300',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  pink:   'bg-pink-100   text-pink-700   dark:bg-pink-900/40  dark:text-pink-300',
  teal:   'bg-teal-100   text-teal-700   dark:bg-teal-900/40  dark:text-teal-300',
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}

const SECTION_STRIPE: Record<string, string> = {
  slate:  'bg-slate-100  text-slate-700  dark:bg-slate-800/80  dark:text-slate-300',
  blue:   'bg-blue-100   text-blue-800   dark:bg-blue-900/60   dark:text-blue-200',
  amber:  'bg-amber-100  text-amber-800  dark:bg-amber-900/60  dark:text-amber-200',
  green:  'bg-green-100  text-green-800  dark:bg-green-900/60  dark:text-green-200',
  red:    'bg-red-100    text-red-800    dark:bg-red-900/60    dark:text-red-200',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200',
  pink:   'bg-pink-100   text-pink-800   dark:bg-pink-900/60   dark:text-pink-200',
  teal:   'bg-teal-100   text-teal-800   dark:bg-teal-900/60   dark:text-teal-200',
  indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200',
}

function areaBadgeClass(color?: string) {
  return AREA_BADGE[color ?? 'slate'] ?? AREA_BADGE.slate
}
function itemBadgeClass(color?: string) {
  return ITEM_BADGE[color ?? 'slate'] ?? ITEM_BADGE.slate
}
function colorDotClass(color?: string) {
  return COLOR_DOT[color ?? 'slate'] ?? COLOR_DOT.slate
}

// ── Zod schema ─────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  areaId:      z.number().min(1, 'Required'),
  sectionId:   z.preprocess(
    v => (v === '' || v == null) ? undefined : Number(v),
    z.number().optional()
  ),
  name:        z.string().min(1, 'Required'),
  category:    z.enum(['spare_parts', 'tools', 'rigging', 'safety', 'food', 'beverages',
                       'medicine', 'navigation', 'electronics', 'clothing', 'documents', 'other']),
  quantity:    z.preprocess(v => Number(String(v).replace(',', '.')), z.number().min(0)),
  unit:        z.string().min(1, 'Required'),
  minQuantity: z.preprocess(
    v => (v === '' || v == null) ? undefined : Number(String(v).replace(',', '.')),
    z.number().min(0).optional()
  ),
  expiryDate:  z.string().optional(),
  notes:       z.string().optional(),
})

type ItemFormData = z.infer<typeof itemSchema>

// ── Alert helpers ──────────────────────────────────────────────────────────────

function isLowStock(item: StorageItem)    { return item.minQuantity != null && item.quantity < item.minQuantity }
function isExpired(item: StorageItem)     { return !!item.expiryDate && item.expiryDate < new Date().toISOString().slice(0, 10) }
function isExpiringSoon(item: StorageItem) {
  if (!item.expiryDate) return false
  const today = new Date().toISOString().slice(0, 10)
  const soon  = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
  return item.expiryDate > today && item.expiryDate <= soon
}

// ── ItemCard ───────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  onEdit,
  onDelete,
  onCopy,
}: {
  item: StorageItem
  onEdit: () => void
  onDelete: () => void
  onCopy: () => void
}) {
  const { t } = useTranslation()
  const low     = isLowStock(item)
  const expired = isExpired(item)
  const soon    = isExpiringSoon(item)

  return (
    <div className="card p-3 flex flex-col gap-2">
      {/* Name + actions */}
      <div className="flex items-start gap-1.5">
        <p className="text-sm font-semibold leading-snug flex-1 min-w-0 break-words text-gray-900 dark:text-gray-100">
          {item.name}
        </p>
        <div className="flex gap-0.5 flex-shrink-0 ml-1">
          <button onClick={onEdit}   title={t('common.edit')}       className="p-1 rounded text-gray-400 hover:text-blue-600  hover:bg-blue-50  dark:hover:bg-blue-950  transition-colors"><Pencil  className="w-3 h-3" /></button>
          <button onClick={onCopy}   title={t('storage.copyItem')}  className="p-1 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950 transition-colors"><Copy    className="w-3 h-3" /></button>
          <button onClick={onDelete} title={t('common.delete')}     className="p-1 rounded text-gray-400 hover:text-red-600   hover:bg-red-50   dark:hover:bg-red-950   transition-colors"><Trash2  className="w-3 h-3" /></button>
        </div>
      </div>

      {/* Category + quantity */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          {CAT_EMOJI[item.category] ?? '📦'} {t(`storage.categories.${item.category}`)}
        </span>
        <span className="text-[10px] text-gray-300 dark:text-gray-600">·</span>
        <span className="text-sm font-mono font-medium text-gray-700 dark:text-gray-300">
          {item.quantity} {item.unit}
        </span>
        {low && (
          <span className="flex items-center gap-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
            <AlertTriangle className="w-3 h-3" />{t('storage.lowStock')}
            <span className="font-normal text-gray-400">({item.minQuantity} {item.unit})</span>
          </span>
        )}
      </div>

      {/* Expiry — always rendered for consistent card height */}
      <span className={`flex items-center gap-1 text-[11px] font-medium ${
        expired ? 'text-red-600 dark:text-red-400' :
        soon    ? 'text-amber-600 dark:text-amber-400' :
        item.expiryDate ? 'text-gray-500 dark:text-gray-400' :
                          'text-gray-300 dark:text-gray-600'
      }`}>
        <Clock className="w-3 h-3 flex-shrink-0" />
        {item.expiryDate
          ? `${expired ? `${t('storage.expired')} ` : ''}${item.expiryDate}`
          : '—'
        }
      </span>
    </div>
  )
}

// ── ItemModal ──────────────────────────────────────────────────────────────────

function ItemModal({
  open,
  onClose,
  editingItem,
  areas,
  sections,
}: {
  open: boolean
  onClose: () => void
  editingItem: StorageItem | null
  areas: StorageArea[]
  sections: StorageSection[]
}) {
  const { t } = useTranslation()
  const isEdit = editingItem != null

  const defaultAreaId = editingItem?.areaId ?? areas[0]?.id ?? 0

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      areaId:      defaultAreaId,
      sectionId:   editingItem?.sectionId ?? undefined,
      name:        editingItem?.name        ?? '',
      category:    editingItem?.category    ?? 'other',
      quantity:    editingItem?.quantity    ?? 1,
      unit:        editingItem?.unit        ?? 'Stk',
      minQuantity: editingItem?.minQuantity ?? undefined,
      expiryDate:  editingItem?.expiryDate  ?? '',
      notes:       editingItem?.notes       ?? '',
    },
  })

  const watchedAreaId = watch('areaId')

  const availableSections = useMemo(
    () => sections.filter(s => s.areaId === watchedAreaId),
    [sections, watchedAreaId]
  )

  // Reset section when area changes (skip initial mount)
  const prevAreaRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (prevAreaRef.current !== undefined && prevAreaRef.current !== watchedAreaId) {
      setValue('sectionId', undefined)
    }
    prevAreaRef.current = watchedAreaId
  }, [watchedAreaId, setValue])

  // Area dropdown open state + click-outside
  const [areaDropOpen, setAreaDropOpen] = useState(false)
  const areaDropRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!areaDropOpen) return
    function handleClick(e: MouseEvent) {
      if (areaDropRef.current && !areaDropRef.current.contains(e.target as Node)) setAreaDropOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [areaDropOpen])

  async function onSubmit(data: ItemFormData) {
    const now = new Date().toISOString()
    const payload: Omit<StorageItem, 'id'> = {
      areaId:      data.areaId,
      sectionId:   data.sectionId ?? undefined,
      name:        data.name,
      category:    data.category,
      quantity:    data.quantity,
      unit:        data.unit,
      minQuantity: data.minQuantity && data.minQuantity > 0 ? data.minQuantity : undefined,
      expiryDate:  data.expiryDate  || undefined,
      notes:       data.notes       || undefined,
      createdAt:   editingItem?.createdAt ?? now,
      updatedAt:   now,
    }

    if (isEdit && editingItem?.id != null) {
      await db.storageItems.update(editingItem.id, payload)
      toast.success(t('storage.itemUpdated'))
    } else {
      await db.storageItems.add(payload as StorageItem)
      toast.success(t('storage.itemAdded'))
    }
    reset()
    onClose()
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={isEdit ? t('storage.editItem') : t('storage.addItem')}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.name')} *</label>
          <input {...register('name')} className="input w-full" placeholder={t('common.name')} autoFocus={!isEdit} />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
        </div>

        {/* Bereich + Fach side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div ref={areaDropRef}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('storage.area')} *</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAreaDropOpen(v => !v)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-left flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              >
                {(() => { const a = areas.find(a => a.id === watchedAreaId); return a ? <><span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colorDotClass(a.color)}`} /><span className="flex-1 truncate text-sm">{a.name}</span></> : <span className="flex-1 text-sm text-gray-400">—</span> })()}
                <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${areaDropOpen ? 'rotate-180' : ''}`} />
              </button>
              {areaDropOpen && (
                <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
                  {areas.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setValue('areaId', a.id!, { shouldValidate: true }); setAreaDropOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors ${
                        a.id === watchedAreaId
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colorDotClass(a.color)}`} />
                      <span className="flex-1">{a.name}</span>
                      {a.id === watchedAreaId && <Check className="w-4 h-4 ml-auto text-blue-600 dark:text-blue-400 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('storage.compartmentOptional')}
            </label>
            <div className="relative">
              <select {...register('sectionId')} className="input appearance-none pr-9">
                <option value="">— {t('common.optional')} —</option>
                {availableSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Kategorie */}
        <EmojiSelect
          label={`${t('storage.category')} *`}
          options={CATEGORIES.map(c => ({ value: c, label: t(`storage.categories.${c}`), emoji: CAT_EMOJI[c] ?? '📦' }))}
          value={watch('category')}
          onChange={v => setValue('category', v as StorageCategory, { shouldValidate: true })}
          error={errors.category?.message}
        />

        {/* Menge + Einheit */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('storage.quantity')} *</label>
            <div className="flex">
              <button
                type="button"
                onClick={() => {
                  const cur = parseFloat(String(watch('quantity') ?? 0).replace(',', '.')) || 0
                  setValue('quantity', Math.max(0, cur - 1), { shouldValidate: true })
                }}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-r-0 border-gray-300 dark:border-gray-600 rounded-l-lg text-gray-700 dark:text-gray-300 font-semibold text-base leading-none transition-colors flex-shrink-0 select-none"
              >−</button>
              <input {...register('quantity')} type="text" inputMode="decimal" className="input rounded-none text-center flex-1 min-w-0" placeholder="0" />
              <button
                type="button"
                onClick={() => {
                  const cur = parseFloat(String(watch('quantity') ?? 0).replace(',', '.')) || 0
                  setValue('quantity', cur + 1, { shouldValidate: true })
                }}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-lg text-gray-700 dark:text-gray-300 font-semibold text-base leading-none transition-colors flex-shrink-0 select-none"
              >+</button>
            </div>
            {errors.quantity && <p className="text-xs text-red-500 mt-1">{errors.quantity.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('storage.unit')} *</label>
            <input {...register('unit')} list="storage-units" className="input w-full" placeholder="Stk" />
            <datalist id="storage-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
          </div>
        </div>

        {/* Mindestmenge + Ablaufdatum */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('storage.minQuantity')} <span className="text-gray-400 text-xs">({t('common.optional')})</span>
            </label>
            <input {...register('minQuantity')} type="text" inputMode="decimal" className="input w-full" placeholder="—" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('storage.expiryDate')} <span className="text-gray-400 text-xs">({t('common.optional')})</span>
            </label>
            <input {...register('expiryDate')} type="date" className="input w-full" />
          </div>
        </div>

        {/* Notizen */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('storage.notes')} <span className="text-gray-400 text-xs">({t('common.optional')})</span>
          </label>
          <textarea {...register('notes')} rows={2} className="input w-full resize-none" placeholder="…" />
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit">{isEdit ? t('common.save') : t('storage.addItem')}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── ManageAreasModal ───────────────────────────────────────────────────────────

function ManageAreasModal({
  open,
  onClose,
  areas,
  sections,
}: {
  open: boolean
  onClose: () => void
  areas: StorageArea[]
  sections: StorageSection[]
}) {
  const { t } = useTranslation()

  const [expandedId,      setExpandedId]      = useState<number | null>(areas[0]?.id ?? null)
  const [editingAreaId,   setEditingAreaId]   = useState<number | null>(null)
  const [editAreaName,    setEditAreaName]    = useState('')
  const [editAreaColor,   setEditAreaColor]   = useState('blue')
  const [newAreaName,     setNewAreaName]     = useState('')
  const [newAreaColor,    setNewAreaColor]    = useState('blue')
  const [editingSectionId,  setEditingSectionId]  = useState<number | null>(null)
  const [editSectionName,   setEditSectionName]   = useState('')
  const [newSectionName,    setNewSectionName]    = useState<Record<number, string>>({})
  const [deleteAreaConfirm, setDeleteAreaConfirm] = useState<StorageArea | null>(null)

  const sectionsByArea = useMemo(() => {
    const m = new Map<number, StorageSection[]>()
    sections.forEach(s => {
      if (!m.has(s.areaId)) m.set(s.areaId, [])
      m.get(s.areaId)!.push(s)
    })
    return m
  }, [sections])

  // ── Area CRUD ──
  async function addArea() {
    if (!newAreaName.trim()) return
    const maxOrder = areas.reduce((m, a) => Math.max(m, a.order), 0)
    await db.storageAreas.add({ name: newAreaName.trim(), color: newAreaColor, order: maxOrder + 1, createdAt: new Date().toISOString() })
    toast.success(t('storage.areaAdded'))
    setNewAreaName('')
  }

  async function saveEditArea(id: number) {
    if (!editAreaName.trim()) return
    await db.storageAreas.update(id, { name: editAreaName.trim(), color: editAreaColor })
    toast.success(t('storage.areaUpdated'))
    setEditingAreaId(null)
  }

  async function deleteArea(area: StorageArea) {
    if (!area.id) return
    await db.storageItems.where('areaId').equals(area.id).delete()
    await db.storageSections.where('areaId').equals(area.id).delete()
    await db.storageAreas.delete(area.id)
    toast.success(t('storage.areaDeleted'))
    setDeleteAreaConfirm(null)
    if (expandedId === area.id) setExpandedId(null)
  }

  // ── Section CRUD ──
  async function addSection(areaId: number) {
    const name = newSectionName[areaId]?.trim()
    if (!name) return
    const areaSecs = sectionsByArea.get(areaId) ?? []
    const maxOrder = areaSecs.reduce((m, s) => Math.max(m, s.order), 0)
    await db.storageSections.add({ areaId, name, order: maxOrder + 1, createdAt: new Date().toISOString() })
    toast.success(t('storage.compartmentAdded'))
    setNewSectionName(prev => ({ ...prev, [areaId]: '' }))
  }

  async function saveEditSection(id: number) {
    if (!editSectionName.trim()) return
    await db.storageSections.update(id, { name: editSectionName.trim() })
    toast.success(t('storage.compartmentUpdated'))
    setEditingSectionId(null)
  }

  async function deleteSection(sec: StorageSection) {
    if (!sec.id) return
    // Move affected items to "no compartment" (keep areaId)
    await db.storageItems.where('sectionId').equals(sec.id).modify(item => { delete item.sectionId })
    await db.storageSections.delete(sec.id)
    toast.success(t('storage.compartmentDeleted'))
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={t('storage.manageAreas')} size="lg">
      <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
        {areas.map(area => {
          const areaSecs  = sectionsByArea.get(area.id!) ?? []
          const isExpanded = expandedId === area.id
          const isEditing  = editingAreaId === area.id

          return (
            <div key={area.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {/* Area row */}
              <div className={`flex items-center gap-2 px-3 py-2.5 ${isExpanded ? 'bg-gray-50 dark:bg-gray-800/60' : 'bg-white dark:bg-gray-900'}`}>
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${colorDotClass(area.color)}`} />

                {isEditing ? (
                  <>
                    <input
                      className="input flex-1 py-1 text-sm"
                      value={editAreaName}
                      onChange={e => setEditAreaName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEditArea(area.id!) }}
                      autoFocus
                    />
                    {/* Mini color swatches */}
                    <div className="flex gap-1 flex-shrink-0">
                      {COLOR_OPTIONS.map(c => (
                        <button key={c} onClick={() => setEditAreaColor(c)}
                          className={`w-4 h-4 rounded-full ${colorDotClass(c)} ${editAreaColor === c ? 'ring-2 ring-offset-1 ring-gray-500 dark:ring-gray-300' : 'opacity-70'}`}
                        />
                      ))}
                    </div>
                    <button onClick={() => saveEditArea(area.id!)} className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingAreaId(null)} className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{area.name}</span>
                    <span className="text-xs text-gray-400 mr-1">{areaSecs.length} {t('storage.compartments')}</span>
                    <button onClick={() => { setEditingAreaId(area.id!); setEditAreaName(area.name); setEditAreaColor(area.color ?? 'blue') }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteAreaConfirm(area)}
                      className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setExpandedId(isExpanded ? null : area.id!)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </>
                )}
              </div>

              {/* Sections (expanded) */}
              {isExpanded && (
                <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 space-y-1.5">
                  {areaSecs.map(sec => (
                    <div key={sec.id} className="flex items-center gap-2">
                      {editingSectionId === sec.id ? (
                        <>
                          <input className="input flex-1 py-1 text-sm" value={editSectionName}
                            onChange={e => setEditSectionName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEditSection(sec.id!) }}
                            autoFocus />
                          <button onClick={() => saveEditSection(sec.id!)} className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingSectionId(null)} className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 pl-1">{sec.name}</span>
                          <button onClick={() => { setEditingSectionId(sec.id!); setEditSectionName(sec.name) }}
                            className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => deleteSection(sec)}
                            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}

                  {/* Add section input */}
                  <div className="flex gap-2 pt-1.5 border-t border-gray-100 dark:border-gray-700">
                    <input
                      className="input flex-1 text-sm"
                      value={newSectionName[area.id!] ?? ''}
                      onChange={e => setNewSectionName(prev => ({ ...prev, [area.id!]: e.target.value }))}
                      placeholder={t('storage.compartmentName')}
                      onKeyDown={e => { if (e.key === 'Enter') addSection(area.id!) }}
                    />
                    <button onClick={() => addSection(area.id!)}
                      className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1 whitespace-nowrap">
                      <Plus className="w-3.5 h-3.5" />{t('storage.addCompartment')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add new area */}
      <div className="flex gap-2 pt-3 mt-2 border-t border-gray-200 dark:border-gray-700 flex-wrap">
        <input
          className="input flex-1 min-w-0"
          value={newAreaName}
          onChange={e => setNewAreaName(e.target.value)}
          placeholder={t('storage.areaName')}
          onKeyDown={e => { if (e.key === 'Enter') addArea() }}
        />
        <div className="flex gap-1 items-center">
          {COLOR_OPTIONS.map(c => (
            <button key={c} onClick={() => setNewAreaColor(c)}
              className={`w-5 h-5 rounded-full ${colorDotClass(c)} ${newAreaColor === c ? 'ring-2 ring-offset-1 ring-gray-500 dark:ring-gray-300' : 'opacity-60 hover:opacity-100'}`}
            />
          ))}
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={addArea}>{t('storage.addArea')}</Button>
      </div>

      {/* Delete area confirmation (inline) */}
      {deleteAreaConfirm && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">
              {t('storage.deleteAreaText', { name: deleteAreaConfirm.name })}
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeleteAreaConfirm(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={() => deleteArea(deleteAreaConfirm)}>{t('common.delete')}</Button>
          </div>
        </div>
      )}

      <div className="flex justify-end mt-4">
        <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
      </div>
    </Modal>
  )
}

// ── Main Storage component ─────────────────────────────────────────────────────

export function Storage() {
  const { t } = useTranslation()
  const location = useLocation()

  const [activeAreaId,    setActiveAreaId]    = useState<number | 'all'>('all')
  const [search,          setSearch]          = useState('')
  const [alertFilter,     setAlertFilter]     = useState<'all' | 'alerts' | 'expired' | 'expiringSoon' | 'lowStock'>('all')
  const [modalOpen,       setModalOpen]       = useState(false)
  const [editingItem,     setEditingItem]     = useState<StorageItem | null>(null)
  const [manageAreasOpen, setManageAreasOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const [collapsedAreas,  setCollapsedAreas]  = useState<Set<number>>(new Set())
  const handledItemRef = useRef(false)

  const areas    = useLiveQuery(() => db.storageAreas.orderBy('order').toArray())    ?? []
  const sections = useLiveQuery(() => db.storageSections.orderBy('order').toArray()) ?? []
  const items    = useLiveQuery(() => db.storageItems.toArray())                      ?? []

  // Auto-open item when navigated from Search with { state: { editItemId } }
  useEffect(() => {
    if (handledItemRef.current || items.length === 0) return
    const editItemId = (location.state as { editItemId?: number } | null)?.editItemId
    if (!editItemId) return
    const item = items.find(i => i.id === editItemId)
    if (item) {
      handledItemRef.current = true
      openEdit(item)
      window.history.replaceState({}, '')
    }
  }, [items, location.state])

  const areaMap = useMemo(() => new Map(areas.map(a => [a.id!, a])), [areas])
  const sectionMap = useMemo(() => new Map(sections.map(s => [s.id!, s])), [sections])

  const sectionsByArea = useMemo(() => {
    const m = new Map<number, StorageSection[]>()
    sections.forEach(s => {
      if (!m.has(s.areaId)) m.set(s.areaId, [])
      m.get(s.areaId)!.push(s)
    })
    return m
  }, [sections])

  // Grouped items for display
  const groupedItems = useMemo(() => {
    const q = search.toLowerCase().trim()

    const filtered = items.filter(item => {
      if (activeAreaId !== 'all' && item.areaId !== activeAreaId) return false
      if (alertFilter === 'alerts'      && !isExpired(item) && !isExpiringSoon(item) && !isLowStock(item)) return false
      if (alertFilter === 'expired'     && !isExpired(item))     return false
      if (alertFilter === 'expiringSoon' && !isExpiringSoon(item)) return false
      if (alertFilter === 'lowStock'    && !isLowStock(item))    return false
      if (q) {
        const area = areaMap.get(item.areaId)
        const sec  = item.sectionId ? sectionMap.get(item.sectionId) : undefined
        const text = `${item.name} ${item.notes ?? ''} ${item.category} ${area?.name ?? ''} ${sec?.name ?? ''}`.toLowerCase()
        if (!text.includes(q)) return false
      }
      return true
    })

    const relevantAreas = activeAreaId === 'all'
      ? areas
      : areas.filter(a => a.id === activeAreaId)

    type Group = { section: StorageSection | null; items: StorageItem[] }
    type AreaGroup = { area: StorageArea; groups: Group[] }
    const result: AreaGroup[] = []

    for (const area of relevantAreas) {
      const areaItems = filtered.filter(i => i.areaId === area.id)
      if (areaItems.length === 0) continue

      const bySection = new Map<number | null, StorageItem[]>()
      areaItems.forEach(item => {
        const key = item.sectionId ?? null
        if (!bySection.has(key)) bySection.set(key, [])
        bySection.get(key)!.push(item)
      })

      const groups: Group[] = []
      // Ordered sections first
      for (const sec of sectionsByArea.get(area.id!) ?? []) {
        if (bySection.has(sec.id!)) {
          groups.push({ section: sec, items: bySection.get(sec.id!)! })
        }
      }
      // Items with no section last
      if (bySection.has(null)) {
        groups.push({ section: null, items: bySection.get(null)! })
      }

      result.push({ area, groups })
    }

    return result
  }, [items, areas, activeAreaId, alertFilter, search, areaMap, sectionMap, sectionsByArea])

  function openAdd() { setEditingItem(null); setModalOpen(true) }
  function openEdit(item: StorageItem) { setEditingItem(item); setModalOpen(true) }

  async function handleDelete(id: number) {
    await db.storageItems.delete(id)
    toast.success(t('storage.itemDeleted'))
    setDeleteConfirmId(null)
  }

  async function handleCopy(item: StorageItem) {
    const now = new Date().toISOString()
    const { id: _id, ...rest } = item
    await db.storageItems.add({ ...rest, name: `${item.name} (Kopie)`, createdAt: now, updatedAt: now })
    toast.success(t('storage.itemCopied'))
  }

  const itemToDelete = deleteConfirmId != null ? items.find(i => i.id === deleteConfirmId) : null
  const totalItems   = items.length

  return (
    <div className="space-y-6">
      {/* Toolbar — title · area tabs (scrollable) · search · actions */}
      <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
        <span className="text-base font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">{t('nav.storage')}</span>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

        {/* Horizontally scrollable area tabs */}
        <div className="flex gap-1.5 overflow-x-auto flex-1 min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setActiveAreaId('all')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex-shrink-0 ${
              activeAreaId === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {t('storage.allAreas')}
          </button>
          {areas.map(a => (
            <button
              key={a.id}
              onClick={() => setActiveAreaId(a.id!)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex-shrink-0 ${
                activeAreaId === a.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${activeAreaId === a.id ? 'bg-white/70' : colorDotClass(a.color)}`} />
              {a.name}
            </button>
          ))}
        </div>

        {/* Inline search */}
        <div className="relative flex-shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('storage.searchPlaceholder')}
            className="pl-8 pr-7 py-[5px] text-sm w-36 sm:w-44 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Alert filter */}
        <select
          value={alertFilter}
          onChange={e => setAlertFilter(e.target.value as typeof alertFilter)}
          className={`px-2 py-[5px] text-sm appearance-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors flex-shrink-0 ${alertFilter !== 'all' ? 'border-amber-500 dark:border-amber-400 text-amber-700 dark:text-amber-300' : ''}`}
        >
          <option value="all">{t('common.all')}</option>
          <option value="alerts">{t('storage.allAlerts')}</option>
          <option value="expired">{t('storage.expired')}</option>
          <option value="expiringSoon">{t('storage.expiringSoon')}</option>
          <option value="lowStock">{t('storage.lowStock')}</option>
        </select>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
        <button
          onClick={() => setManageAreasOpen(true)}
          title={t('storage.manageAreas')}
          className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
        >
          <Settings2 className="w-4 h-4" />
        </button>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openAdd} disabled={areas.length === 0}>
          {t('storage.addItem')}
        </Button>
      </div>

      {/* Content */}
      {areas.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-12 text-center gap-3">
            <Package className="w-12 h-12 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">{t('storage.noAreas')}</p>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setManageAreasOpen(true)}>
              {t('storage.addArea')}
            </Button>
          </div>
        </Card>
      ) : groupedItems.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-12 text-center gap-3">
            <Package className="w-12 h-12 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500 dark:text-gray-400">{t('storage.noItems')}</p>
            <Button icon={<Plus className="w-4 h-4" />} onClick={openAdd}>{t('storage.addItem')}</Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {groupedItems.map(({ area, groups }) => {
            const totalCount = groups.reduce((n, g) => n + g.items.length, 0)
            const isCollapsed = collapsedAreas.has(area.id!)
            const toggleArea = () => setCollapsedAreas(prev => {
              const next = new Set(prev)
              if (next.has(area.id!)) next.delete(area.id!)
              else next.add(area.id!)
              return next
            })
            const headerClass = AREA_HEADER[area.color ?? 'slate'] ?? AREA_HEADER.slate
            return (
              <div key={area.id} className="rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700">
                {/* Area header — solid color, white text */}
                <button
                  onClick={toggleArea}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-white ${headerClass} hover:brightness-95 transition-all`}
                >
                  <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                  <span className="font-semibold text-sm flex-1">{area.name}</span>
                  <span className="text-xs bg-white/20 rounded-full px-2 py-0.5 tabular-nums">{totalCount}</span>
                </button>

                {/* Items grid */}
                {!isCollapsed && (
                  <div className="p-4 bg-white dark:bg-gray-900">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {groups.flatMap(({ items: groupItems }) =>
                        groupItems.map(item => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            onEdit={() => openEdit(item)}
                            onDelete={() => setDeleteConfirmId(item.id!)}
                            onCopy={() => handleCopy(item)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Item Modal */}
      {modalOpen && (
        <ItemModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditingItem(null) }}
          editingItem={editingItem}
          areas={areas}
          sections={sections}
        />
      )}

      {/* Manage Areas Modal */}
      <ManageAreasModal
        open={manageAreasOpen}
        onClose={() => setManageAreasOpen(false)}
        areas={areas}
        sections={sections}
      />

      {/* Delete Item Confirm */}
      <Modal isOpen={deleteConfirmId != null} onClose={() => setDeleteConfirmId(null)} title={t('storage.deleteItemTitle')}>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
              {t('storage.deleteItemText', { name: itemToDelete?.name ?? '' })}
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={() => deleteConfirmId != null && handleDelete(deleteConfirmId)}>
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
