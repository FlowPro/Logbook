import { useState, useMemo, useEffect, useRef } from 'react'
import React from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  PlusCircle, Edit, Trash2, Wrench, Save, Archive, ArchiveRestore,
  ChevronDown, ChevronUp, AlertCircle, AlertTriangle, GripVertical,
  Clock, CheckCircle2, ClipboardList, X, Repeat,
} from 'lucide-react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import { useLiveQuery } from 'dexie-react-hooks'
import { isAfter, parseISO, subDays, format, addDays, addMonths, addYears } from 'date-fns'
import { toast } from 'sonner'
import { db } from '../db/database'
import { useSettings } from '../hooks/useSettings'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import type { MaintenanceEntry, MaintenanceStatus, MaintenancePriority, MaintenanceChecklistItem, MaintenanceRecurrenceType } from '../db/models'

// ── Constants ─────────────────────────────────────────────────────────────────

const ARCHIVE_CUTOFF_DAYS = 90

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'AUD', 'CAD', 'JPY', 'NZD', 'SGD', 'ZAR', 'BRL']

const CAT_EMOJI: Record<string, string> = {
  engine: '⚙️', rigging: '⛵', safety: '🦺',
  hull: '🚢', electronics: '📡', sails: '🪁', other: '🔧',
}

const PRIORITY_CLS: Record<string, string> = {
  low:      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  medium:   'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  high:     'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  critical: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

// ── Schema ────────────────────────────────────────────────────────────────────

const optNum = z.preprocess(
  v => (v === '' || v === null || v === undefined || (typeof v === 'number' && isNaN(v))) ? undefined : Number(v),
  z.number().positive().optional()
)

const schema = z.object({
  description:           z.string().min(1),
  category:              z.enum(['engine', 'rigging', 'safety', 'hull', 'electronics', 'sails', 'other']),
  priority:              z.enum(['low', 'medium', 'high', 'critical']),
  dueDate:               z.string().optional(),
  date:                  z.string().optional(),
  engineHoursAtService:  optNum,
  nextServiceDueDate:    z.string().optional(),
  nextServiceDueHours:   optNum,
  cost:                  optNum,
  currency:              z.string().optional(),
  performedBy:           z.string().optional(),
  notes:                 z.string().optional(),
})

type FormData = z.infer<typeof schema>

function makeDefaults(currency?: string): FormData {
  return { description: '', category: 'engine', priority: 'medium', currency: currency ?? 'EUR' }
}

// ── Helper components ─────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority?: MaintenancePriority }) {
  const { t } = useTranslation()
  const cls = PRIORITY_CLS[priority ?? 'medium']
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>
      {t(`maintenance.priorities.${priority ?? 'medium'}`)}
    </span>
  )
}

function DueDateIndicator({ dueDate }: { dueDate: string }) {
  const { t } = useTranslation()
  const today = new Date()
  const due = parseISO(dueDate)
  const overdue = isAfter(today, due)
  const soon = !overdue && isAfter(new Date(today.getTime() + 7 * 86400000), due)
  return (
    <span className={`flex items-center gap-1 text-[11px] font-medium ${
      overdue ? 'text-red-600 dark:text-red-400' : soon ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'
    }`}>
      {overdue ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {overdue ? t('maintenance.overdueLabel') : ''}{format(due, 'dd.MM.yy')}
    </span>
  )
}

function EngineHoursIndicator({ dueHours, currentHours }: { dueHours: number; currentHours: number }) {
  const { t } = useTranslation()
  const diff = Math.round(currentHours - dueHours)
  const overdue = diff >= 0
  const soon = !overdue && (dueHours - currentHours) <= 50
  return (
    <span className={`flex items-center gap-1 text-[11px] font-medium ${
      overdue ? 'text-red-600 dark:text-red-400' : soon ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'
    }`}>
      {overdue ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {overdue
        ? t('maintenance.engineHoursOverdue', { hours: diff })
        : t('maintenance.engineHoursDue', { current: Math.round(currentHours), due: dueHours })
      }
    </span>
  )
}

// ── Kanban Card ───────────────────────────────────────────────────────────────

interface CardProps {
  entry: MaintenanceEntry
  index: number
  catLabel: string
  currentEngineHours: number | null
  onEdit: () => void
  onDelete: () => void
  onAdvance: () => void
  onArchive: () => void
}

function KanbanCard({ entry, index, catLabel, currentEngineHours, onEdit, onDelete, onAdvance, onArchive }: CardProps) {
  const { t } = useTranslation()
  const status = entry.status ?? 'done'

  return (
    <Draggable draggableId={String(entry.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`card p-3 space-y-2 transition-shadow select-none ${
            snapshot.isDragging ? 'shadow-xl ring-2 ring-blue-400 rotate-1' : ''
          }`}
        >
          {/* Title row */}
          <div className="flex items-start gap-1.5">
            <div
              {...provided.dragHandleProps}
              className="mt-0.5 text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0"
              title={t('maintenance.drag')}
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
            <p className="text-sm font-semibold leading-snug flex-1 min-w-0 break-words">
              {entry.description ?? t('maintenance.noTitle')}
            </p>
            <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
              <button
                onClick={onEdit}
                className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
              >
                <Edit className="w-3 h-3" />
              </button>
              <button
                onClick={onDelete}
                className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-500 dark:text-gray-400">{CAT_EMOJI[entry.category] ?? '🔧'} {catLabel}</span>
            <PriorityBadge priority={entry.priority} />
            {entry.recurring && entry.recurrenceType && entry.recurrenceValue && (
              <span className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                <Repeat className="w-3 h-3" />
                {entry.recurrenceValue} {t(`maintenance.recurrenceTypes.${entry.recurrenceType}`)}
              </span>
            )}
          </div>

          {/* Checklist progress */}
          {entry.checklist && entry.checklist.length > 0 && (() => {
            const doneCount = entry.checklist!.filter(i => i.done).length
            const total = entry.checklist!.length
            return (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${(doneCount / total) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-500 whitespace-nowrap tabular-nums">
                  {doneCount}/{total}
                </span>
              </div>
            )
          })()}

          {/* Date / engine-hours indicator */}
          {status !== 'done' && entry.dueDate && <DueDateIndicator dueDate={entry.dueDate} />}
          {status !== 'done' && entry.nextServiceDueHours != null && currentEngineHours != null && (
            <EngineHoursIndicator dueHours={entry.nextServiceDueHours} currentHours={currentEngineHours} />
          )}
          {status === 'done' && entry.date && (
            <span className="text-[11px] text-gray-400">✓ {entry.date}</span>
          )}

          {/* Bottom action */}
          <div className="flex items-center border-t border-gray-100 dark:border-gray-700 pt-1.5">
            {status !== 'done' ? (
              <button
                onClick={onAdvance}
                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {status === 'planned' ? t('maintenance.moveToInProgress') : t('maintenance.moveToDone')}
              </button>
            ) : (
              <button
                onClick={onArchive}
                className="text-[11px] font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
              >
                <Archive className="w-3 h-3" /> {t('maintenance.archive')}
              </button>
            )}
          </div>
        </div>
      )}
    </Draggable>
  )
}

// ── Kanban Column ─────────────────────────────────────────────────────────────

interface ColumnProps {
  id: MaintenanceStatus
  title: string
  icon: React.ReactNode
  headerCls: string
  entries: MaintenanceEntry[]
  catLabel: (cat: string) => string
  currentEngineHours: number | null
  onAdd: () => void
  onEdit: (e: MaintenanceEntry) => void
  onDelete: (id: number) => void
  onAdvance: (e: MaintenanceEntry) => void
  onArchive: (id: number) => void
}

function KanbanColumn({ id, title, icon, headerCls, entries, catLabel, currentEngineHours, onAdd, onEdit, onDelete, onAdvance, onArchive }: ColumnProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl ${headerCls}`}>
        {icon}
        <span className="text-sm font-semibold">{title}</span>
        <span className="ml-auto text-xs font-medium bg-white/40 dark:bg-black/20 px-1.5 py-0.5 rounded-full">
          {entries.length}
        </span>
        <button
          onClick={onAdd}
          className="p-0.5 rounded hover:bg-white/50 dark:hover:bg-black/20 transition-colors"
          title={t('maintenance.addTask')}
        >
          <PlusCircle className="w-3.5 h-3.5" />
        </button>
      </div>
      <Droppable droppableId={id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 space-y-2 p-2 rounded-b-xl min-h-[180px] transition-colors ${
              snapshot.isDraggingOver
                ? 'bg-blue-50 dark:bg-blue-950/30 ring-2 ring-inset ring-blue-300 dark:ring-blue-700'
                : 'bg-gray-50 dark:bg-gray-800/40'
            }`}
          >
            {entries.map((entry, i) => (
              <KanbanCard
                key={entry.id}
                entry={entry}
                index={i}
                catLabel={catLabel(entry.category)}
                currentEngineHours={currentEngineHours}
                onEdit={() => onEdit(entry)}
                onDelete={() => onDelete(entry.id!)}
                onAdvance={() => onAdvance(entry)}
                onArchive={() => onArchive(entry.id!)}
              />
            ))}
            {provided.placeholder}
            {entries.length === 0 && !snapshot.isDraggingOver && (
              <p className="text-xs text-gray-400 dark:text-gray-600 text-center pt-6 italic">
                {t('maintenance.empty')}
              </p>
            )}
          </div>
        )}
      </Droppable>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Maintenance() {
  const { t } = useTranslation()
  const { settings } = useSettings()
  const location = useLocation()
  const [modalOpen,     setModalOpen]     = useState(false)
  const [editingId,     setEditingId]     = useState<number | null>(null)
  const [modalStatus,   setModalStatus]   = useState<MaintenanceStatus>('planned')
  const [saving,        setSaving]        = useState(false)
  const [saved,         setSaved]         = useState(false)
  const [filterCat,     setFilterCat]     = useState('all')
  const [filterYear,    setFilterYear]    = useState('all')
  const [showArchive,   setShowArchive]   = useState(false)
  const [checklist,     setChecklist]     = useState<MaintenanceChecklistItem[]>([])
  const [newItemText,   setNewItemText]   = useState('')
  const [recurring,         setRecurring]         = useState(false)
  const [recurrenceType,    setRecurrenceType]    = useState('months')
  const [recurrenceValue,   setRecurrenceValue]   = useState(3)
  const [deleteConfirmId,   setDeleteConfirmId]   = useState<number | null>(null)

  const allEntries = useLiveQuery(() => db.maintenance.orderBy('id').reverse().toArray())

  // Auto-open task when navigated from Dashboard with { state: { editId } }
  const handledEditRef = useRef(false)
  useEffect(() => {
    if (handledEditRef.current || !allEntries) return
    const editId = (location.state as { editId?: number } | null)?.editId
    if (!editId) return
    const entry = allEntries.find(e => e.id === editId)
    if (entry) {
      handledEditRef.current = true
      openEdit(entry)
      window.history.replaceState({}, '')
    }
  }, [allEntries, location.state])
  const activeCrew = useLiveQuery(() => db.crew.filter(c => c.isActive).toArray())
  const latestEngineHours = useLiveQuery(async () => {
    let max = 0
    await db.logEntries.each(e => {
      if (e.engineHoursTotal && e.engineHoursTotal > max) max = e.engineHoursTotal
    })
    return max > 0 ? max : null
  })

  const archiveCutoff = useMemo(
    () => subDays(new Date(), ARCHIVE_CUTOFF_DAYS).toISOString().split('T')[0],
    []
  )

  // Available years from completed entries' date field
  const availableYears = useMemo(() => {
    if (!allEntries) return []
    const years = new Set(
      allEntries
        .filter(e => e.status === 'done' || e.archivedAt)
        .map(e => e.date?.slice(0, 4))
        .filter(Boolean)
    )
    return Array.from(years).sort((a, b) => (b as string).localeCompare(a as string)) as string[]
  }, [allEntries])

  const { planned, inProgress, done, archive } = useMemo(() => {
    const planned: MaintenanceEntry[] = []
    const inProgress: MaintenanceEntry[] = []
    const done: MaintenanceEntry[] = []
    const archive: MaintenanceEntry[] = []
    if (!allEntries) return { planned, inProgress, done, archive }

    const filtered = filterCat === 'all' ? allEntries : allEntries.filter(e => e.category === filterCat)

    for (const entry of filtered) {
      const status = entry.status ?? 'done'
      if (entry.archivedAt) {
        // Apply year filter to archive
        if (filterYear === 'all' || entry.date?.startsWith(filterYear)) archive.push(entry)
        continue
      }
      if (status === 'done' && entry.date && entry.date < archiveCutoff) {
        // Apply year filter to auto-archived done entries
        if (filterYear === 'all' || entry.date?.startsWith(filterYear)) archive.push(entry)
        continue
      }
      if (status === 'planned') planned.push(entry)
      else if (status === 'in_progress') inProgress.push(entry)
      else {
        // Apply year filter to recent "done" entries
        if (filterYear === 'all' || entry.date?.startsWith(filterYear)) done.push(entry)
      }
    }
    return { planned, inProgress, done, archive }
  }, [allEntries, filterCat, filterYear, archiveCutoff])

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: makeDefaults(settings?.defaultCurrency),
  })

  // ── Helpers ────────────────────────────────────────────────────────────────

  function catLabel(cat: string) { return t(`maintenance.categories.${cat}`) }

  function openAdd(status: MaintenanceStatus = 'planned') {
    reset({
      ...makeDefaults(settings?.defaultCurrency),
      date: status === 'done' ? new Date().toISOString().split('T')[0] : undefined,
    })
    setChecklist([])
    setNewItemText('')
    setRecurring(false)
    setRecurrenceType('months')
    setRecurrenceValue(3)
    setEditingId(null)
    setModalStatus(status)
    setModalOpen(true)
  }

  function openEdit(entry: MaintenanceEntry) {
    reset({
      description:          entry.description,
      category:             entry.category,
      priority:             entry.priority ?? 'medium',
      dueDate:              entry.dueDate,
      date:                 entry.date,
      engineHoursAtService: entry.engineHoursAtService,
      nextServiceDueDate:   entry.nextServiceDueDate,
      nextServiceDueHours:  entry.nextServiceDueHours,
      cost:                 entry.cost,
      currency:             entry.currency ?? settings?.defaultCurrency ?? 'EUR',
      performedBy:          entry.performedBy,
      notes:                entry.notes,
    })
    setChecklist(entry.checklist ?? [])
    setNewItemText('')
    setRecurring(entry.recurring ?? false)
    setRecurrenceType(entry.recurrenceType ?? 'months')
    setRecurrenceValue(entry.recurrenceValue ?? 3)
    setEditingId(entry.id!)
    setModalStatus(entry.status ?? 'done')
    setModalOpen(true)
  }

  async function createRecurringTask(entry: MaintenanceEntry, completionDate: string) {
    if (!entry.recurring || !entry.recurrenceType || !entry.recurrenceValue) return
    const now = new Date().toISOString()
    let nextDueDate: string | undefined
    let nextServiceDueHours: number | undefined
    const base = parseISO(completionDate)
    switch (entry.recurrenceType) {
      case 'days':   nextDueDate = format(addDays(base, entry.recurrenceValue), 'yyyy-MM-dd'); break
      case 'weeks':  nextDueDate = format(addDays(base, entry.recurrenceValue * 7), 'yyyy-MM-dd'); break
      case 'months': nextDueDate = format(addMonths(base, entry.recurrenceValue), 'yyyy-MM-dd'); break
      case 'years':  nextDueDate = format(addYears(base, entry.recurrenceValue), 'yyyy-MM-dd'); break
      case 'engine_hours': {
        // Use engineHoursAtService if recorded; otherwise fall back to the
        // highest engineHoursTotal found in the log so the next task is not
        // immediately overdue when the user didn't fill in that field.
        let baseHours = entry.engineHoursAtService ?? 0
        if (!baseHours) {
          await db.logEntries.each(e => { if ((e.engineHoursTotal ?? 0) > baseHours) baseHours = e.engineHoursTotal! })
        }
        nextServiceDueHours = baseHours + entry.recurrenceValue
        break
      }
    }
    await db.maintenance.add({
      description: entry.description, category: entry.category, priority: entry.priority,
      status: 'planned', dueDate: nextDueDate, nextServiceDueHours,
      recurring: true, recurrenceType: entry.recurrenceType, recurrenceValue: entry.recurrenceValue,
      notes: entry.notes,
      checklist: entry.checklist?.map(item => ({ ...item, done: false })),
      createdAt: now, updatedAt: now,
    })
    const label = nextDueDate ?? `${nextServiceDueHours} h`
    toast.success(t('maintenance.recurringCreated', { label }))
  }

  function addChecklistItem() {
    if (!newItemText.trim()) return
    setChecklist(prev => [...prev, { id: crypto.randomUUID(), text: newItemText.trim(), done: false }])
    setNewItemText('')
  }

  function toggleChecklistItem(id: string) {
    setChecklist(prev => prev.map(item => item.id === id ? { ...item, done: !item.done } : item))
  }

  function removeChecklistItem(id: string) {
    setChecklist(prev => prev.filter(item => item.id !== id))
  }

  async function onSubmit(data: FormData) {
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const base = {
        ...data,
        date: data.date || (modalStatus === 'done' ? now.split('T')[0] : undefined),
        status: modalStatus,
        checklist: checklist.length > 0 ? checklist : undefined,
        recurring: recurring || undefined,
        recurrenceType: recurring ? recurrenceType as MaintenanceRecurrenceType : undefined,
        recurrenceValue: recurring ? recurrenceValue : undefined,
        updatedAt: now,
      }
      if (editingId) {
        await db.maintenance.update(editingId, base)
        toast.success(t('maintenance.taskUpdated'))
      } else {
        await db.maintenance.add({ ...base, createdAt: now })
        toast.success(t('maintenance.taskAdded'))
      }
      setSaved(true)
      setTimeout(() => { setSaved(false); setModalOpen(false) }, 500)
    } finally {
      setSaving(false)
    }
  }

  function deleteEntry(id: number) {
    setDeleteConfirmId(id)
  }

  async function confirmDelete() {
    if (deleteConfirmId === null) return
    await db.maintenance.delete(deleteConfirmId)
    setDeleteConfirmId(null)
    toast(t('maintenance.taskDeleted'))
  }

  async function advanceStatus(entry: MaintenanceEntry) {
    const next: MaintenanceStatus = (entry.status ?? 'done') === 'planned' ? 'in_progress' : 'done'
    const now = new Date().toISOString()
    const completionDate = now.split('T')[0]
    await db.maintenance.update(entry.id!, {
      status: next,
      date: next === 'done' ? completionDate : entry.date,
      updatedAt: now,
    })
    toast.success(`→ ${t(`maintenance.statusLabels.${next}`)}`, { description: entry.description })
    if (next === 'done') await createRecurringTask(entry, completionDate)
  }

  async function archiveEntry(id: number) {
    await db.maintenance.update(id, { archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    toast(t('maintenance.archived'))
  }

  async function unarchiveEntry(id: number) {
    await db.maintenance.update(id, { archivedAt: undefined, updatedAt: new Date().toISOString() })
    toast(t('maintenance.unarchived'))
  }

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return
    if (result.source.droppableId === result.destination.droppableId) return
    const id = parseInt(result.draggableId)
    const newStatus = result.destination.droppableId as MaintenanceStatus
    const now = new Date().toISOString()
    const completionDate = now.split('T')[0]
    await db.maintenance.update(id, {
      status: newStatus,
      date: newStatus === 'done' ? completionDate : undefined,
      updatedAt: now,
    })
    toast.success(`→ ${t(`maintenance.statusLabels.${newStatus}`)}`)
    if (newStatus === 'done') {
      const movedEntry = await db.maintenance.get(id)
      if (movedEntry) await createRecurringTask(movedEntry, completionDate)
    }
  }

  // ── Options ────────────────────────────────────────────────────────────────

  const recurrenceTypeOptions = [
    { value: 'days',         label: t('maintenance.recurrenceTypes.days') },
    { value: 'weeks',        label: t('maintenance.recurrenceTypes.weeks') },
    { value: 'months',       label: t('maintenance.recurrenceTypes.months') },
    { value: 'years',        label: t('maintenance.recurrenceTypes.years') },
    { value: 'engine_hours', label: t('maintenance.recurrenceTypes.engine_hours') },
  ]

  const categoryOptions = [
    { value: 'engine',      label: t('maintenance.categories.engine') },
    { value: 'rigging',     label: t('maintenance.categories.rigging') },
    { value: 'safety',      label: t('maintenance.categories.safety') },
    { value: 'hull',        label: t('maintenance.categories.hull') },
    { value: 'electronics', label: t('maintenance.categories.electronics') },
    { value: 'sails',       label: t('maintenance.categories.sails') },
    { value: 'other',       label: t('maintenance.categories.other') },
  ]

  const priorityOptions = [
    { value: 'low',      label: t('maintenance.priorities.low') },
    { value: 'medium',   label: t('maintenance.priorities.medium') },
    { value: 'high',     label: t('maintenance.priorities.high') },
    { value: 'critical', label: t('maintenance.priorities.critical') },
  ]


  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t('maintenance.title')}</h1>
        <Button icon={<PlusCircle className="w-4 h-4" />} onClick={() => openAdd('planned')}>
          {t('maintenance.newTask')}
        </Button>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Category filter */}
        <div className="flex gap-2 flex-wrap">
          {[{ value: 'all', label: t('common.all') }, ...categoryOptions].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterCat(opt.value)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                filterCat === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {opt.value !== 'all' ? `${CAT_EMOJI[opt.value]} ${opt.label}` : opt.label}
            </button>
          ))}
        </div>
        {/* Year filter — affects Erledigt + Archiv */}
        {availableYears.length > 0 && (
          <select
            value={filterYear}
            onChange={e => setFilterYear(e.target.value)}
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-[5px] bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            title={t('maintenance.filterYear')}
          >
            <option value="all">{t('maintenance.allYears')}</option>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {/* Kanban board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid md:grid-cols-3 gap-4 items-start">

          <KanbanColumn
            id="planned"
            title={t('maintenance.statusLabels.planned')}
            icon={<ClipboardList className="w-4 h-4" />}
            headerCls="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            entries={planned}
            catLabel={catLabel}
            currentEngineHours={latestEngineHours ?? null}
            onAdd={() => openAdd('planned')}
            onEdit={openEdit}
            onDelete={deleteEntry}
            onAdvance={advanceStatus}
            onArchive={archiveEntry}
          />

          <KanbanColumn
            id="in_progress"
            title={t('maintenance.statusLabels.in_progress')}
            icon={<Clock className="w-4 h-4" />}
            headerCls="bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400"
            entries={inProgress}
            catLabel={catLabel}
            currentEngineHours={latestEngineHours ?? null}
            onAdd={() => openAdd('in_progress')}
            onEdit={openEdit}
            onDelete={deleteEntry}
            onAdvance={advanceStatus}
            onArchive={archiveEntry}
          />

          {/* Done column + archive */}
          <div>
            <KanbanColumn
              id="done"
              title={t('maintenance.statusLabels.done')}
              icon={<CheckCircle2 className="w-4 h-4" />}
              headerCls="bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-400"
              entries={done}
              catLabel={catLabel}
              currentEngineHours={latestEngineHours ?? null}
              onAdd={() => openAdd('done')}
              onEdit={openEdit}
              onDelete={deleteEntry}
              onAdvance={advanceStatus}
              onArchive={archiveEntry}
            />

            {/* Archive section */}
            {archive.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setShowArchive(v => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/40 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <Archive className="w-4 h-4 flex-shrink-0" />
                  <span>{archive.length === 1 ? t('maintenance.archiveEntry', { count: archive.length }) : t('maintenance.archiveEntries', { count: archive.length })}</span>
                  {showArchive
                    ? <ChevronUp className="w-4 h-4 ml-auto" />
                    : <ChevronDown className="w-4 h-4 ml-auto" />}
                </button>

                {showArchive && (
                  <div className="mt-1.5 space-y-1.5">
                    {archive.map(entry => (
                      <div key={entry.id} className="card px-3 py-2 flex items-center justify-between gap-2 opacity-60 hover:opacity-90 transition-opacity">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{entry.description}</p>
                          <p className="text-[10px] text-gray-400">
                            {CAT_EMOJI[entry.category]} {catLabel(entry.category)}
                            {entry.date && ` · ${entry.date}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {entry.archivedAt && (
                            <button
                              onClick={() => unarchiveEntry(entry.id!)}
                              className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                              title={t('maintenance.restore')}
                            >
                              <ArchiveRestore className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(entry)}
                            className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteEntry(entry.id!)}
                            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </DragDropContext>

      {/* Empty state */}
      {allEntries && allEntries.length === 0 && (
        <div className="text-center py-16">
          <Wrench className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">{t('maintenance.noTasks')}</p>
          <Button onClick={() => openAdd('planned')}>{t('maintenance.addFirst')}</Button>
        </div>
      )}

      {/* Modal ──────────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? t('maintenance.editTask') : t('maintenance.newTask')}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSubmit(onSubmit)} loading={saving} icon={<Save className="w-4 h-4" />}>
              {saved ? t('common.saved') : t('common.save')}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Status selector */}
          <div>
            <label className="label">Status</label>
            <div className="flex gap-2 mt-1">
              {(['planned', 'in_progress', 'done'] as const).map(value => {
                const Icon = value === 'planned' ? ClipboardList : value === 'in_progress' ? Clock : CheckCircle2
                const label = t(`maintenance.statusLabels.${value}`)
                return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setModalStatus(value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    modalStatus === value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              )
              })}
            </div>
          </div>

          {/* Title */}
          <Input
            label={t('maintenance.titleLabel')}
            {...register('description')}
            error={errors.description?.message}
            required
            placeholder={t('maintenance.titlePlaceholder')}
          />

          {/* Category + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <Select label={t('maintenance.category')} options={categoryOptions} {...register('category')} />
            <Select label={t('maintenance.priorityLabel')} options={priorityOptions} {...register('priority')} />
          </div>

          {/* Due date */}
          <Input label={t('maintenance.dueByDate')} type="date" {...register('dueDate')} />

          {/* Recurrence */}
          <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                <Repeat className="w-3.5 h-3.5 text-blue-500" />
                {t('maintenance.recurring')}
              </span>
              <button type="button" onClick={() => setRecurring(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  recurring ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  recurring ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {recurring && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 whitespace-nowrap">{t('maintenance.recurrenceType')}</span>
                <input type="number" min={1} value={recurrenceValue}
                  onChange={e => setRecurrenceValue(Math.max(1, parseInt(e.target.value) || 1))}
                  className="input w-20" />
                <select value={recurrenceType} onChange={e => setRecurrenceType(e.target.value)}
                  className="input appearance-none flex-1">
                  {recurrenceTypeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Checklist */}
          <div>
            <label className="label">{t('maintenance.checklist')}</label>
            <div className="space-y-1.5 mt-1">
              {checklist.map(item => (
                <div key={item.id} className="flex items-center gap-2 group">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleChecklistItem(item.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 flex-shrink-0 cursor-pointer"
                  />
                  <span className={`flex-1 text-sm ${item.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                    {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeChecklistItem(item.id)}
                    className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newItemText}
                  onChange={e => setNewItemText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() } }}
                  placeholder={t('maintenance.checklistItemPlaceholder')}
                  className="input text-sm flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={addChecklistItem}
                  disabled={!newItemText.trim()}
                  icon={<PlusCircle className="w-3.5 h-3.5" />}
                >
                  {t('maintenance.checklistAddItem')}
                </Button>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label">{t('common.notes')}</label>
            <textarea {...register('notes')} rows={2} className="input resize-none" />
          </div>

        </form>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title={t('maintenance.deleteConfirm')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDeleteConfirmId(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" size="sm" onClick={confirmDelete}>{t('common.delete')}</Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {t('maintenance.deleteConfirmText', {
              title: allEntries?.find(e => e.id === deleteConfirmId)?.description ?? t('maintenance.noTitle'),
            })}
          </p>
        </div>
      </Modal>
    </div>
  )
}
