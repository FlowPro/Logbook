import { useState, useMemo } from 'react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  PlusCircle, Edit, Trash2, Wrench, Save, Archive, ArchiveRestore,
  ChevronDown, ChevronUp, AlertCircle, GripVertical,
  Clock, CheckCircle2, ClipboardList,
} from 'lucide-react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import { useLiveQuery } from 'dexie-react-hooks'
import { isAfter, parseISO, subDays, format } from 'date-fns'
import { toast } from 'sonner'
import { db } from '../db/database'
import { useSettings } from '../hooks/useSettings'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import type { MaintenanceEntry, MaintenanceStatus, MaintenancePriority } from '../db/models'

// ── Constants ─────────────────────────────────────────────────────────────────

const ARCHIVE_CUTOFF_DAYS = 90

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'AUD', 'CAD', 'JPY', 'NZD', 'SGD', 'ZAR', 'BRL']

const CAT_EMOJI: Record<string, string> = {
  engine: '⚙️', rigging: '⛵', safety: '🦺',
  hull: '🚢', electronics: '📡', sails: '🪁', other: '🔧',
}

const PRIORITY_CFG: Record<string, { label: string; cls: string }> = {
  low:      { label: 'Niedrig',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  medium:   { label: 'Mittel',   cls: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  high:     { label: 'Hoch',     cls: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  critical: { label: 'Kritisch', cls: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
}

// ── Schema ────────────────────────────────────────────────────────────────────

const optNum = z.preprocess(
  v => (v === '' || v === null || v === undefined || (typeof v === 'number' && isNaN(v))) ? undefined : Number(v),
  z.number().positive().optional()
)

const schema = z.object({
  description:           z.string().min(1, 'Titel erforderlich'),
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
  const cfg = PRIORITY_CFG[priority ?? 'medium']
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function DueDateIndicator({ dueDate }: { dueDate: string }) {
  const today = new Date()
  const due = parseISO(dueDate)
  const overdue = isAfter(today, due)
  const soon = !overdue && isAfter(new Date(today.getTime() + 7 * 86400000), due)
  return (
    <span className={`flex items-center gap-1 text-[11px] font-medium ${
      overdue ? 'text-red-600 dark:text-red-400' : soon ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'
    }`}>
      {overdue ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {overdue ? 'Überfällig · ' : ''}{format(due, 'dd.MM.yy')}
    </span>
  )
}

// ── Kanban Card ───────────────────────────────────────────────────────────────

interface CardProps {
  entry: MaintenanceEntry
  index: number
  catLabel: string
  onEdit: () => void
  onDelete: () => void
  onAdvance: () => void
  onArchive: () => void
}

function KanbanCard({ entry, index, catLabel, onEdit, onDelete, onAdvance, onArchive }: CardProps) {
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
              title="Ziehen zum Verschieben"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
            <p className="text-sm font-semibold leading-snug flex-1 min-w-0 break-words">
              {entry.description ?? '(kein Titel)'}
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
            <span className="text-sm leading-none">{CAT_EMOJI[entry.category] ?? '🔧'}</span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400">{catLabel}</span>
            <PriorityBadge priority={entry.priority} />
          </div>

          {/* Date indicator */}
          {status !== 'done' && entry.dueDate && <DueDateIndicator dueDate={entry.dueDate} />}
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
                {status === 'planned' ? '→ In Arbeit' : '→ Erledigt'}
              </button>
            ) : (
              <button
                onClick={onArchive}
                className="text-[11px] font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
              >
                <Archive className="w-3 h-3" /> Archivieren
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
  onAdd: () => void
  onEdit: (e: MaintenanceEntry) => void
  onDelete: (id: number) => void
  onAdvance: (e: MaintenanceEntry) => void
  onArchive: (id: number) => void
}

function KanbanColumn({ id, title, icon, headerCls, entries, catLabel, onAdd, onEdit, onDelete, onAdvance, onArchive }: ColumnProps) {
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
          title="Aufgabe hinzufügen"
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
                onEdit={() => onEdit(entry)}
                onDelete={() => onDelete(entry.id!)}
                onAdvance={() => onAdvance(entry)}
                onArchive={() => onArchive(entry.id!)}
              />
            ))}
            {provided.placeholder}
            {entries.length === 0 && !snapshot.isDraggingOver && (
              <p className="text-xs text-gray-400 dark:text-gray-600 text-center pt-6 italic">
                Leer
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
  const [modalOpen,     setModalOpen]     = useState(false)
  const [editingId,     setEditingId]     = useState<number | null>(null)
  const [modalStatus,   setModalStatus]   = useState<MaintenanceStatus>('planned')
  const [saving,        setSaving]        = useState(false)
  const [filterCat,     setFilterCat]     = useState('all')
  const [filterYear,    setFilterYear]    = useState('all')
  const [showArchive,   setShowArchive]   = useState(false)

  const allEntries = useLiveQuery(() => db.maintenance.orderBy('id').reverse().toArray())
  const activeCrew = useLiveQuery(() => db.crew.filter(c => c.isActive).toArray())

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
    setEditingId(entry.id!)
    setModalStatus(entry.status ?? 'done')
    setModalOpen(true)
  }

  async function onSubmit(data: FormData) {
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const base = {
        ...data,
        date: data.date || (modalStatus === 'done' ? now.split('T')[0] : undefined),
        status: modalStatus,
        updatedAt: now,
      }
      if (editingId) {
        await db.maintenance.update(editingId, base)
        toast.success('Aufgabe aktualisiert')
      } else {
        await db.maintenance.add({ ...base, createdAt: now })
        toast.success('Aufgabe hinzugefügt')
      }
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function deleteEntry(id: number) {
    if (!confirm('Aufgabe löschen?')) return
    await db.maintenance.delete(id)
    toast('Aufgabe gelöscht')
  }

  async function advanceStatus(entry: MaintenanceEntry) {
    const next: MaintenanceStatus = (entry.status ?? 'done') === 'planned' ? 'in_progress' : 'done'
    const now = new Date().toISOString()
    await db.maintenance.update(entry.id!, {
      status: next,
      date: next === 'done' ? now.split('T')[0] : entry.date,
      updatedAt: now,
    })
    const labels: Record<MaintenanceStatus, string> = { planned: 'Geplant', in_progress: 'In Arbeit', done: 'Erledigt' }
    toast.success(`→ ${labels[next]}`, { description: entry.description })
  }

  async function archiveEntry(id: number) {
    await db.maintenance.update(id, { archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    toast('Archiviert')
  }

  async function unarchiveEntry(id: number) {
    await db.maintenance.update(id, { archivedAt: undefined, updatedAt: new Date().toISOString() })
    toast('Aus Archiv entfernt')
  }

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return
    if (result.source.droppableId === result.destination.droppableId) return
    const id = parseInt(result.draggableId)
    const newStatus = result.destination.droppableId as MaintenanceStatus
    const now = new Date().toISOString()
    await db.maintenance.update(id, {
      status: newStatus,
      date: newStatus === 'done' ? now.split('T')[0] : undefined,
      updatedAt: now,
    })
    const labels: Record<MaintenanceStatus, string> = { planned: 'Geplant', in_progress: 'In Arbeit', done: 'Erledigt' }
    toast.success(`→ ${labels[newStatus]}`)
  }

  // ── Options ────────────────────────────────────────────────────────────────

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
    { value: 'low',      label: 'Niedrig' },
    { value: 'medium',   label: 'Mittel' },
    { value: 'high',     label: 'Hoch' },
    { value: 'critical', label: 'Kritisch' },
  ]

  const isDone = modalStatus === 'done'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t('maintenance.title')}</h1>
        <Button icon={<PlusCircle className="w-4 h-4" />} onClick={() => openAdd('planned')}>
          Neue Aufgabe
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
              {opt.value !== 'all' && <span className="mr-1">{CAT_EMOJI[opt.value]}</span>}
              {opt.label}
            </button>
          ))}
        </div>
        {/* Year filter — affects Erledigt + Archiv */}
        {availableYears.length > 0 && (
          <select
            value={filterYear}
            onChange={e => setFilterYear(e.target.value)}
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            title="Erledigte & Archiv nach Jahr filtern"
          >
            <option value="all">Alle Jahre</option>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {/* Kanban board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid md:grid-cols-3 gap-4 items-start">

          <KanbanColumn
            id="planned"
            title="Geplant"
            icon={<ClipboardList className="w-4 h-4" />}
            headerCls="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            entries={planned}
            catLabel={catLabel}
            onAdd={() => openAdd('planned')}
            onEdit={openEdit}
            onDelete={deleteEntry}
            onAdvance={advanceStatus}
            onArchive={archiveEntry}
          />

          <KanbanColumn
            id="in_progress"
            title="In Arbeit"
            icon={<Clock className="w-4 h-4" />}
            headerCls="bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400"
            entries={inProgress}
            catLabel={catLabel}
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
              title="Erledigt"
              icon={<CheckCircle2 className="w-4 h-4" />}
              headerCls="bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-400"
              entries={done}
              catLabel={catLabel}
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
                  <span>Archiv: {archive.length} {archive.length === 1 ? 'Eintrag' : 'Einträge'}</span>
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
                              title="Wiederherstellen"
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
          <p className="text-gray-500 mb-4">Noch keine Wartungsaufgaben erfasst.</p>
          <Button onClick={() => openAdd('planned')}>Erste Aufgabe anlegen</Button>
        </div>
      )}

      {/* Modal ──────────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSubmit(onSubmit)} loading={saving} icon={<Save className="w-4 h-4" />}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form className="space-y-4">

          {/* Status selector */}
          <div>
            <label className="label">Status</label>
            <div className="flex gap-2 mt-1">
              {([
                { value: 'planned',     label: 'Geplant',   Icon: ClipboardList },
                { value: 'in_progress', label: 'In Arbeit', Icon: Clock },
                { value: 'done',        label: 'Erledigt',  Icon: CheckCircle2 },
              ] as const).map(({ value, label, Icon }) => (
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
              ))}
            </div>
          </div>

          {/* Title */}
          <Input
            label="Titel"
            {...register('description')}
            error={errors.description?.message}
            required
            placeholder="z.B. Impeller ersetzen"
          />

          {/* Category + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <Select label={t('maintenance.category')} options={categoryOptions} {...register('category')} />
            <Select label="Priorität" options={priorityOptions} {...register('priority')} />
          </div>

          {/* Due date (planned / in_progress) */}
          {!isDone && (
            <Input label="Fällig bis" type="date" {...register('dueDate')} />
          )}

          {/* Completion details (done) */}
          {isDone && (
            <>
              <div className="p-3 bg-green-50 dark:bg-green-950/40 rounded-xl border border-green-100 dark:border-green-900">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">Erledigungsdetails</p>
                <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">Datum, Kosten, Durchgeführt von…</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label={t('maintenance.date')} type="date" {...register('date')} />
                <Input label={t('maintenance.engineHours')} type="number" step={0.1} {...register('engineHoursAtService')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label={t('maintenance.nextServiceDate')} type="date" {...register('nextServiceDueDate')} />
                <Input label={t('maintenance.nextServiceHours')} type="number" {...register('nextServiceDueHours')} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Input label={t('maintenance.cost')} type="number" step={0.01} {...register('cost')} />
                <Select
                  label={t('maintenance.currency')}
                  options={CURRENCIES.map(c => ({ value: c, label: c }))}
                  {...register('currency')}
                />
                <div>
                  <label className="label">{t('maintenance.performedBy')}</label>
                  <input
                    {...register('performedBy')}
                    list="maint-crew-list"
                    className="input"
                    autoComplete="off"
                  />
                  <datalist id="maint-crew-list">
                    {activeCrew?.map(m => (
                      <option key={m.id} value={`${m.firstName} ${m.lastName}`} />
                    ))}
                  </datalist>
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <label className="label">{t('common.notes')}</label>
            <textarea {...register('notes')} rows={2} className="input resize-none" />
          </div>

        </form>
      </Modal>
    </div>
  )
}
