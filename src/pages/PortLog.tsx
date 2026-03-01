import { useState, useEffect, useRef, useMemo } from 'react'
import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  PlusCircle, Edit, Trash2, MapPin, CheckCircle, XCircle, Save,
  ChevronDown, ChevronUp, Navigation, Wind, Gauge, Anchor, Zap, FileDown,
  Building2, CircleDot, GitCommitHorizontal, Lock, Unlock, Archive, Map as MapIcon,
} from 'lucide-react'
import type { MooringStatus } from '../db/models'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { generatePassagePDF } from '../utils/pdf'
import type { Ship } from '../db/models'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { LogEntryForm } from './LogEntryForm'
import { CountrySelect } from '../components/ui/CountrySelect'
import { OktasBadge } from '../components/ui/OktasPicker'
import { SailDiagram } from '../components/ui/SailDiagram'
import { formatCoordinate } from '../utils/geo'
import { fmtNum } from '../utils/units'
import { toast } from 'sonner'
import type { PassageEntry, LogEntry } from '../db/models'

// ── Passage form schema – dates auto-derived from log entries ─────────────────
const schema = z.object({
  departurePort: z.string().min(1),
  departureCountry: z.string(),
  arrivalPort: z.string().min(1),
  arrivalCountry: z.string(),
  customsClearedOut: z.boolean(),
  customsNotesOut: z.string().optional(),
  customsClearedIn: z.boolean(),
  customsNotesIn: z.string().optional(),
  notes: z.string(),
})

type FormData = z.infer<typeof schema>

const DEFAULTS: FormData = {
  departurePort: '',
  departureCountry: '',
  arrivalPort: '',
  arrivalCountry: '',
  customsClearedOut: false,
  customsNotesOut: '',
  customsClearedIn: false,
  customsNotesIn: '',
  notes: '',
}

// ── Passage stats computed from log entries ───────────────────────────────────
function computeStats(entries: LogEntry[]) {
  if (!entries.length) return { totalNm: 0, avgSOG: 0, maxWindKts: 0, engineEntries: 0 }
  const withSOG = entries.filter(e => e.speedOverGround != null)
  return {
    totalNm: entries.reduce((s, e) => s + (e.distanceSinceLastEntry ?? 0), 0),
    avgSOG: withSOG.length ? withSOG.reduce((s, e) => s + (e.speedOverGround ?? 0), 0) / withSOG.length : 0,
    maxWindKts: Math.max(...entries.map(e => e.windTrueSpeed)),
    engineEntries: entries.filter(e => e.engineOn).length,
  }
}

function trendIcon(trend?: string): string {
  switch (trend) {
    case 'rising_rapidly': return '↑↑'
    case 'rising': return '↑'
    case 'falling': return '↓'
    case 'falling_rapidly': return '↓↓'
    default: return '→'
  }
}

const MOORING_LABEL: Record<string, string> = {
  anchored:         'Anker',
  moored_marina:    'Hafen',
  moored_buoy:      'Boje',
  moored_alongside: 'Längs.',
}

function MooringIcon({ status }: { status?: MooringStatus }) {
  if (!status || status === 'underway') return null
  const cls = 'w-3.5 h-3.5 text-teal-600 dark:text-teal-400 flex-shrink-0'
  switch (status) {
    case 'anchored':         return <Anchor className={cls} />
    case 'moored_marina':    return <Building2 className={cls} />
    case 'moored_buoy':      return <CircleDot className={cls} />
    case 'moored_alongside': return <GitCommitHorizontal className={cls} />
    default: return null
  }
}

const ENTRY_LIMIT = 50

// ── Port autocomplete ─────────────────────────────────────────────────────────
interface PortOption { display: string; country: string }

function PortAutocomplete({
  label, value, onChange, onSelectWithCountry, options, required, error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onSelectWithCountry: (port: string, country: string) => void
  options: PortOption[]
  required?: boolean
  error?: string
}) {
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return []
    return options.filter(o => o.display.toLowerCase().startsWith(q) && o.display.toLowerCase() !== q)
  }, [value, options])

  useEffect(() => { setFocusIdx(0) }, [suggestions.length])

  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[focusIdx] as HTMLElement | undefined
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusIdx])

  function accept(opt: PortOption) {
    onChange(opt.display)
    onSelectWithCountry(opt.display, opt.country)
    setOpen(false)
  }

  // Advance focus to idx+2, skipping the paired country-select field
  function advanceFocus() {
    requestAnimationFrame(() => {
      const form = inputRef.current?.closest('form')
      if (!form) return
      const focusables = Array.from(
        form.querySelectorAll<HTMLElement>('input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"])')
      )
      const idx = focusables.indexOf(inputRef.current!)
      if (idx >= 0 && focusables[idx + 2]) focusables[idx + 2].focus()
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, suggestions.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); accept(suggestions[focusIdx]); advanceFocus() }
    if (e.key === 'Tab')       { e.preventDefault(); accept(suggestions[focusIdx]); advanceFocus() }
    if (e.key === 'Escape')    { setOpen(false) }
  }

  return (
    <div className="relative w-full">
      {label && <label className="label">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>}
      <input
        ref={inputRef}
        className={`input${error ? ' border-red-500 focus:ring-red-500' : ''}`}
        value={value}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-auto max-h-52"
        >
          {suggestions.map((opt, i) => (
            <li
              key={opt.display}
              onMouseDown={e => { e.preventDefault(); accept(opt); advanceFocus() }}
              className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer ${
                i === focusIdx
                  ? 'bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <span className="font-medium">{opt.display}</span>
              {opt.country && <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{opt.country}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Passage card with embedded log entries ────────────────────────────────────
interface PassageCardProps {
  passage: PassageEntry
  onEdit: () => void
  onDelete: () => void
  onAddEntry: () => void
  onEditEntry: (id: number) => void
  onDeleteEntry: (id: number) => void
  onExportPDF: (entries: LogEntry[]) => void | Promise<void>
  onToggleLock: () => void
  onShowMap: () => void
  highlight?: boolean
  defaultOpen?: boolean
}

function PassageCard({ passage, onEdit, onDelete, onAddEntry, onEditEntry, onDeleteEntry, onExportPDF, onToggleLock, onShowMap, highlight, defaultOpen }: PassageCardProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(!!defaultOpen || !!highlight)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [highlight])
  const [showAll, setShowAll] = useState(false)

  // Load only this passage's entries (not all entries globally)
  const entries = useLiveQuery(
    async () => {
      const all = await db.logEntries.where('passageId').equals(passage.id!).sortBy('[date+time]')
      return all.reverse()
    },
    [passage.id]
  ) ?? []

  // entries are newest-first after reverse(), so:
  // oldest entry = entries[entries.length - 1], newest = entries[0]
  const firstEntry = entries.length > 0 ? entries[entries.length - 1] : null
  const lastEntry  = entries.length > 0 ? entries[0] : null

  // Auto-sync passage departure/arrival dates from first/last log entry
  useEffect(() => {
    if (!firstEntry || !lastEntry) return
    if (
      firstEntry.date === passage.departureDate &&
      firstEntry.time === passage.departureTime &&
      lastEntry.date  === passage.arrivalDate   &&
      lastEntry.time  === passage.arrivalTime
    ) return
    db.passages.update(passage.id!, {
      departureDate: firstEntry.date, departureTime: firstEntry.time,
      arrivalDate:   lastEntry.date,  arrivalTime:   lastEntry.time,
      updatedAt: new Date().toISOString(),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstEntry?.date, firstEntry?.time, lastEntry?.date, lastEntry?.time, passage.id])

  const depDisplay = firstEntry
    ? `${firstEntry.date} ${firstEntry.time} UTC`
    : passage.departureDate ? `${passage.departureDate} ${passage.departureTime}` : '—'
  const arrDisplay = lastEntry
    ? `${lastEntry.date} ${lastEntry.time} UTC`
    : passage.arrivalDate ? `${passage.arrivalDate} ${passage.arrivalTime}` : '—'

  const stats = computeStats(entries)
  const visibleEntries = showAll ? entries : entries.slice(0, ENTRY_LIMIT)

  const durationDays = (() => {
    const dep = firstEntry?.date ?? passage.departureDate
    const arr = lastEntry?.date  ?? passage.arrivalDate
    if (!dep || !arr) return null
    const diff = Math.round((new Date(arr).getTime() - new Date(dep).getTime()) / 86400000)
    return diff >= 0 ? diff : null
  })()

  return (
    <div ref={cardRef}>
    <Card padding={false} className={highlight ? 'ring-2 ring-blue-400' : ''}>
      {/* Passage header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">
                {passage.departurePort} → {passage.arrivalPort}
              </h3>
              {passage.locked && (
                <Badge variant="warning">
                  <Lock className="w-3 h-3 mr-1" /> Gesperrt
                </Badge>
              )}
              {(passage.customsClearedOut || (!passage.customsClearedOut && !passage.customsClearedIn && passage.customsCleared)) && (
                <Badge variant="success">
                  <CheckCircle className="w-3 h-3 mr-1" /> Ausklariert
                </Badge>
              )}
              {passage.customsClearedIn && (
                <Badge variant="success">
                  <CheckCircle className="w-3 h-3 mr-1" /> Einklariert
                </Badge>
              )}
              {!passage.customsClearedOut && !passage.customsClearedIn && !passage.customsCleared && (
                <Badge variant="warning">
                  <XCircle className="w-3 h-3 mr-1" /> Zoll offen
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {depDisplay} – {arrDisplay}
              {durationDays !== null && durationDays > 0 && (
                <span className="ml-2 text-gray-400">({durationDays}d)</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onAddEntry}
              disabled={!!passage.locked}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors whitespace-nowrap ${passage.locked ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={passage.locked ? 'Passage gesperrt' : 'Logeintrag hinzufügen'}
            >
              <PlusCircle className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">Logeintrag</span>
            </button>
            <button
              onClick={onShowMap}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors"
              title="Passage auf Karte anzeigen"
              disabled={entries.length === 0}
            >
              <MapIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => onExportPDF(entries)}
              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950 rounded-lg transition-colors"
              title="Passage als PDF exportieren"
              disabled={entries.length === 0}
            >
              <FileDown className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleLock}
              className={`p-1.5 rounded-lg transition-colors ${passage.locked ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950' : 'text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950'}`}
              title={passage.locked ? 'Passage entsperren' : 'Passage sperren'}
            >
              {passage.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>
            <button
              onClick={onEdit}
              disabled={!!passage.locked}
              className={`p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors ${passage.locked ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={passage.locked ? 'Passage gesperrt' : t('common.edit')}
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              disabled={!!passage.locked}
              className={`p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors ${passage.locked ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={passage.locked ? 'Passage gesperrt' : t('common.delete')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Computed stats */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatPill icon={<Navigation className="w-3.5 h-3.5" />} label="Strecke" value={`${fmtNum(stats.totalNm)} nm`} />
          <StatPill icon={<Gauge className="w-3.5 h-3.5" />} label="Ø SOG" value={entries.length ? `${stats.avgSOG.toFixed(1)} kn` : '—'} />
          <StatPill icon={<Wind className="w-3.5 h-3.5" />} label="Max Wind" value={entries.length ? `${stats.maxWindKts.toFixed(0)} kn` : '—'} />
          <StatPill icon={<Anchor className="w-3.5 h-3.5" />} label="Motor" value={`${stats.engineEntries} Eintr.`} />
        </div>

        {/* Notes */}
        {passage.notes && (
          <p className="mt-2 text-sm text-gray-500 italic">"{passage.notes}"</p>
        )}

        {/* Toggle entries */}
        <button
          onClick={() => setOpen(v => !v)}
          className="mt-3 flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {entries.length} Logeinträge
        </button>
      </div>

      {/* Log entries list */}
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          {entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <th className="px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide">Datum / Zeit</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide max-sm:hidden">Position</th>
                    <th className="px-3 py-2 text-center text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide max-md:hidden">Kurs</th>
                    <th className="px-3 py-2 text-center text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide">SOG</th>
                    <th className="px-3 py-2 text-center text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide">Bft</th>
                    <th className="px-3 py-2 text-center text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide max-md:hidden">Oktas</th>
                    <th className="px-3 py-2 text-center text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide max-lg:hidden">hPa</th>
                    <th className="px-3 py-2 text-center text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide max-md:hidden">Antrieb / Status</th>
                    <th className="px-3 py-2 text-center text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide max-md:hidden">nm</th>
                    <th className="px-3 py-2 text-right text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {visibleEntries.map(entry => (
                    <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-mono text-xs">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {entry.date}<br />{entry.time} UTC
                      </td>
                      <td className="px-3 py-2 max-sm:hidden whitespace-nowrap">
                        {formatCoordinate(entry.latitude)}<br />{formatCoordinate(entry.longitude)}
                      </td>
                      <td className="px-3 py-2 text-center max-md:hidden">
                        {entry.courseTrue != null ? `${entry.courseTrue}°` : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {entry.speedOverGround != null ? entry.speedOverGround.toFixed(1) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="beaufort" beaufortForce={entry.windBeaufort} />
                      </td>
                      <td className="px-3 py-2 text-center max-md:hidden">
                        <OktasBadge value={entry.cloudCoverOktas} />
                      </td>
                      <td className="px-3 py-2 text-center max-lg:hidden whitespace-nowrap">
                        {entry.baroPressureHPa ? (
                          <span>{trendIcon(entry.pressureTrend)} {entry.baroPressureHPa.toFixed(0)}</span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center max-md:hidden">
                        <div className="flex flex-col items-center gap-0.5">
                          {entry.mooringStatus && entry.mooringStatus !== 'underway' ? (
                            <div className="flex items-center gap-1 text-teal-600 dark:text-teal-400">
                              <MooringIcon status={entry.mooringStatus} />
                              <span className="text-[10px] font-semibold leading-none">
                                {MOORING_LABEL[entry.mooringStatus]}
                              </span>
                            </div>
                          ) : (
                            <>
                              {entry.engineOn && (
                                <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 leading-none">
                                  <Zap className="w-2.5 h-2.5" />Motor
                                </span>
                              )}
                              {(entry.mainsailState || entry.genoa || entry.staysail || entry.headsail || entry.lightSail) ? (
                                <SailDiagram
                                  mainsailState={entry.mainsailState}
                                  genoa={entry.genoa}
                                  staysail={entry.staysail}
                                  headsail={entry.headsail}
                                  lightSail={entry.lightSail}
                                  size={32}
                                />
                              ) : entry.sailConfig ? (
                                <span className="text-xs text-gray-400">{entry.sailConfig}</span>
                              ) : (
                                <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center max-md:hidden">
                        {entry.distanceSinceLastEntry.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => !passage.locked && onEditEntry(entry.id!)}
                            disabled={!!passage.locked}
                            className={`p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded ${passage.locked ? 'opacity-30 cursor-not-allowed' : ''}`}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => !passage.locked && onDeleteEntry(entry.id!)}
                            disabled={!!passage.locked}
                            className={`p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded ${passage.locked ? 'opacity-30 cursor-not-allowed' : ''}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {entries.length > ENTRY_LIMIT && !showAll && (
                <div className="px-4 py-2 text-center border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => setShowAll(true)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Alle {entries.length} Einträge anzeigen
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-gray-400 italic">Noch keine Logeinträge für diese Passage.</p>
          )}
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
            <Button
              size="sm"
              icon={<PlusCircle className="w-4 h-4" />}
              onClick={onAddEntry}
              disabled={!!passage.locked}
            >
              Logeintrag hinzufügen
            </Button>
          </div>
        </div>
      )}
    </Card>
    </div>
  )
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg px-2.5 py-1.5">
      <span className="text-gray-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 leading-none">{label}</p>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{value}</p>
      </div>
    </div>
  )
}

// ── Main PortLog page ─────────────────────────────────────────────────────────
export function PortLog() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('passage') ? parseInt(searchParams.get('passage')!) : null
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [filterYear, setFilterYear] = useState<string>('all')
  const [showLocked, setShowLocked] = useState(false)
  const [lockingYear, setLockingYear] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'passage' | 'entry'; id: number; label: string } | null>(null)
  const [logModal, setLogModal] = useState<{ open: boolean; passageId?: number; entryId?: number }>({ open: false })

  const passages = useLiveQuery(() =>
    db.passages.orderBy('departureDate').reverse().toArray()
  )
  const ship = useLiveQuery(() => db.ship.toCollection().first()) as Ship | undefined

  // Derive unique years from passage departure dates
  const availableYears = useMemo(() => {
    if (!passages?.length) return []
    const years = new Set(passages.map(p => p.departureDate?.slice(0, 4)).filter(Boolean))
    return Array.from(years).sort((a, b) => b.localeCompare(a)) as string[]
  }, [passages])

  // Filter passages by selected year — locked passages hidden in "all" view unless showLocked
  const filteredPassages = useMemo(() => {
    if (!passages) return []
    let list = filterYear !== 'all'
      ? passages.filter(p => p.departureDate?.startsWith(filterYear))
      : passages
    // In "all years" view, hide locked passages unless the user opts in —
    // but only when there are also unlocked passages; if everything is locked show all.
    if (filterYear === 'all' && !showLocked) {
      const unlocked = list.filter(p => !p.locked)
      if (unlocked.length > 0) list = unlocked
    }
    return list
  }, [passages, filterYear, showLocked])

  const lockedCount = useMemo(() => passages?.filter(p => p.locked).length ?? 0, [passages])

  // True when every passage in the selected year is locked
  const seasonFullyLocked = useMemo(() => {
    if (filterYear === 'all' || !filteredPassages.length) return false
    return filteredPassages.every(p => p.locked)
  }, [filteredPassages, filterYear])

  const { register, handleSubmit, watch, reset, control, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  })

  // Build unique port options from all existing passages
  const portOptions = useMemo((): PortOption[] => {
    if (!passages) return []
    // Use a Map keyed by lowercase port name; later entries overwrite earlier ones for country
    const map = new Map<string, PortOption>()
    for (const p of passages) {
      if (p.departurePort?.trim()) map.set(p.departurePort.trim().toLowerCase(), { display: p.departurePort.trim(), country: p.departureCountry ?? '' })
      if (p.arrivalPort?.trim())   map.set(p.arrivalPort.trim().toLowerCase(),   { display: p.arrivalPort.trim(),   country: p.arrivalCountry ?? '' })
    }
    return Array.from(map.values()).sort((a, b) => a.display.localeCompare(b.display))
  }, [passages])

  const customsClearedOut = watch('customsClearedOut')
  const customsClearedIn = watch('customsClearedIn')

  function openAdd() {
    reset(DEFAULTS)
    setEditingId(null)
    setModalOpen(true)
  }

  function openEdit(p: PassageEntry) {
    reset({
      departurePort: p.departurePort,
      departureCountry: p.departureCountry,
      arrivalPort: p.arrivalPort,
      arrivalCountry: p.arrivalCountry,
      customsClearedOut: p.customsClearedOut ?? p.customsCleared ?? false,
      customsNotesOut: p.customsNotesOut ?? p.customsNotes ?? '',
      customsClearedIn: p.customsClearedIn ?? false,
      customsNotesIn: p.customsNotesIn ?? '',
      notes: p.notes,
    })
    setEditingId(p.id!)
    setModalOpen(true)
  }

  async function onSubmit(data: FormData) {
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const today = new Date().toISOString().split('T')[0]

      // Auto-derive departure/arrival date+time from first/last log entry
      let depDate = today, depTime = '00:00', arrDate = today, arrTime = '00:00'
      if (editingId) {
        const entryList = await db.logEntries.where('passageId').equals(editingId).sortBy('[date+time]')
        if (entryList.length > 0) {
          depDate = entryList[0].date;   depTime = entryList[0].time
          arrDate = entryList[entryList.length - 1].date; arrTime = entryList[entryList.length - 1].time
        } else {
          const existing = await db.passages.get(editingId)
          depDate = existing?.departureDate ?? today; depTime = existing?.departureTime ?? '00:00'
          arrDate = existing?.arrivalDate ?? today;   arrTime = existing?.arrivalTime ?? '00:00'
        }
      }

      const saveData = {
        ...data,
        departureDate: depDate, departureTime: depTime,
        arrivalDate: arrDate,   arrivalTime: arrTime,
        customsCleared: data.customsClearedOut || data.customsClearedIn,
        crewManifest: [], notes: data.notes ?? '',
      }
      if (editingId) {
        await db.passages.update(editingId, { ...saveData, updatedAt: now })
      } else {
        await db.passages.add({ ...saveData, createdAt: now, updatedAt: now })
      }
      setSaved(true)
      setTimeout(() => { setSaved(false); setModalOpen(false) }, 500)
    } finally {
      setSaving(false)
    }
  }

  async function toggleLock(p: PassageEntry) {
    const newLocked = !p.locked
    await db.passages.update(p.id!, { locked: newLocked, updatedAt: new Date().toISOString() })
    const desc = `${p.departurePort} → ${p.arrivalPort}`
    if (newLocked) {
      toast.success(t('portLog.passageLocked'), { description: desc })
    } else {
      toast(t('portLog.passageUnlocked'), { description: desc })
    }
  }

  function deletePassage(id: number) {
    const p = passages?.find(x => x.id === id)
    const label = p ? `${p.departurePort} → ${p.arrivalPort}` : '—'
    setDeleteConfirm({ type: 'passage', id, label })
  }

  function deleteEntry(id: number) {
    setDeleteConfirm({ type: 'entry', id, label: '' })
  }

  async function executeDelete() {
    if (!deleteConfirm) return
    const { type, id } = deleteConfirm
    setDeleteConfirm(null)
    if (type === 'passage') {
      await db.logEntries.where('passageId').equals(id).delete()
      await db.passages.delete(id)
      toast.success(t('portLog.passageDeleted'))
    } else {
      await db.logEntries.delete(id)
      toast.success(t('portLog.entryDeleted'))
    }
  }

  async function lockSeason() {
    const year = filterYear === 'all' ? null : filterYear
    if (!year) return
    const tolock = (passages ?? []).filter(p => p.departureDate?.startsWith(year) && !p.locked)
    if (tolock.length === 0) {
      toast(t('portLog.seasonsAllLocked', { year }))
      return
    }
    setLockingYear(true)
    try {
      const now = new Date().toISOString()
      await Promise.all(tolock.map(p => db.passages.update(p.id!, { locked: true, updatedAt: now })))
      toast.success(t('portLog.seasonLocked', { year }), { description: t('portLog.seasonLockDesc', { count: tolock.length }) })
    } finally {
      setLockingYear(false)
    }
  }

  // Determine which passage card should be open by default
  // Bug fix: exclude locked passages from auto-open (a locked active passage stays closed on reload)
  const today = new Date().toISOString().split('T')[0]
  const firstActiveId = passages?.find(p => !p.locked && p.departureDate <= today && today <= p.arrivalDate)?.id
  const defaultOpenId = highlightId ?? firstActiveId ?? filteredPassages[0]?.id

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 flex-wrap">
        <span className="text-base font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">{t('nav.portLog')}</span>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          className="px-3 py-[5px] text-sm appearance-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors cursor-pointer"
        >
          <option value="all">{t('portLog.allYearsCount', { count: passages?.length ?? 0 })}</option>
          {availableYears.map(y => (
            <option key={y} value={y}>
              {y} ({(passages ?? []).filter(p => p.departureDate?.startsWith(y)).length})
            </option>
          ))}
        </select>
        {filterYear === 'all' && lockedCount > 0 && (
          <button
            onClick={() => setShowLocked(v => !v)}
            className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg border transition-colors ${
              showLocked
                ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
            title={showLocked ? 'Gesperrte Passagen ausblenden' : 'Gesperrte Passagen anzeigen'}
          >
            <Lock className="w-3.5 h-3.5" />
            {showLocked ? 'Gesperrte ausbl.' : `Gesperrt (${lockedCount})`}
          </button>
        )}
        {filterYear !== 'all' && (
          <button
            onClick={lockSeason}
            disabled={lockingYear || seasonFullyLocked}
            className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg border transition-colors disabled:cursor-default ${
              seasonFullyLocked
                ? 'border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40'
                : 'border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950 disabled:opacity-50'
            }`}
            title={seasonFullyLocked ? t('portLog.seasonsAllLocked', { year: filterYear }) : t('portLog.lockSeasonTitle', { year: filterYear })}
          >
            {seasonFullyLocked ? <Lock className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            {seasonFullyLocked ? t('portLog.seasonLockedBtn', { year: filterYear }) : t('portLog.lockSeasonBtn', { year: filterYear })}
          </button>
        )}
        {filterYear !== 'all' && (
          <span className="text-sm text-gray-400 flex-shrink-0">
            {filteredPassages.length} {t('export.passages').toLowerCase()}
          </span>
        )}
        <div className="flex-1" />
        <Button icon={<PlusCircle className="w-4 h-4" />} onClick={openAdd}>
          {t('portLog.newPassage')}
        </Button>
      </div>

      {passages && passages.length > 0 ? (
        filteredPassages.length > 0 ? (
          <div className="space-y-4">
            {filteredPassages.map(p => (
              <PassageCard
                key={p.id}
                passage={p}
                onEdit={() => openEdit(p)}
                onDelete={() => deletePassage(p.id!)}
                onAddEntry={() => setLogModal({ open: true, passageId: p.id! })}
                onEditEntry={(entryId) => setLogModal({ open: true, passageId: p.id!, entryId })}
                onDeleteEntry={deleteEntry}
                onExportPDF={async (entries) => {
                  await generatePassagePDF(p, entries, ship)
                  if (!p.locked) {
                    await db.passages.update(p.id!, { locked: true, updatedAt: new Date().toISOString() })
                    toast.success(t('portLog.passageLocked'), { description: `${p.departurePort} → ${p.arrivalPort}` })
                  }
                }}
                onToggleLock={() => toggleLock(p)}
                onShowMap={() => navigate('/map', { state: { passageId: p.id } })}
                highlight={highlightId === p.id}
                defaultOpen={defaultOpenId === p.id}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">{t('portLog.noPassagesYear', { year: filterYear })}</p>
          </div>
        )
      ) : (
        <div className="text-center py-16">
          <MapPin className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">Noch keine Passagen erfasst.</p>
          <p className="text-sm text-gray-400 mb-6">Lege zuerst eine Passage an, dann kannst du Logeinträge hinzufügen.</p>
          <Button onClick={openAdd}>Erste Passage anlegen</Button>
        </div>
      )}

      {/* Passage form modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Passage bearbeiten' : 'Neue Passage'}
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Date/time info – auto-derived from entries */}
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-sm text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900">
            <p className="font-medium mb-0.5">Datum & Uhrzeit</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Werden automatisch aus dem ersten und letzten Logeintrag der Passage übernommen.</p>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">{t('portLog.departure')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <PortAutocomplete
                label={`${t('portLog.port')} (Abfahrt)`}
                value={watch('departurePort')}
                onChange={v => setValue('departurePort', v, { shouldValidate: true })}
                onSelectWithCountry={(port, country) => {
                  setValue('departurePort', port, { shouldValidate: true })
                  if (country) setValue('departureCountry', country)
                }}
                options={portOptions}
                required
                error={errors.departurePort?.message}
              />
              <Controller name="departureCountry" control={control} render={({ field }) => (
                <CountrySelect label={t('portLog.country')} valueType="name" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
              )} />
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">{t('portLog.arrival')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <PortAutocomplete
                label={`${t('portLog.port')} (Ankunft)`}
                value={watch('arrivalPort')}
                onChange={v => setValue('arrivalPort', v, { shouldValidate: true })}
                onSelectWithCountry={(port, country) => {
                  setValue('arrivalPort', port, { shouldValidate: true })
                  if (country) setValue('arrivalCountry', country)
                }}
                options={portOptions}
                required
                error={errors.arrivalPort?.message}
              />
              <Controller name="arrivalCountry" control={control} render={({ field }) => (
                <CountrySelect label={t('portLog.country')} valueType="name" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
              )} />
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">{t('portLog.customs')}</h4>
            <div className="space-y-3">
              {/* Ausklarieren (departure) */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <label className="flex items-center gap-2 cursor-pointer p-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <input type="checkbox" {...register('customsClearedOut')} className="w-4 h-4 rounded" />
                  <div>
                    <span className="text-sm font-medium block">Ausklariert</span>
                    <span className="text-xs text-gray-500">Zoll im Abfahrtshafen erledigt</span>
                  </div>
                </label>
                {customsClearedOut && (
                  <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-700">
                    <label className="label">Notizen Ausklarieren</label>
                    <textarea {...register('customsNotesOut')} rows={2} className="input resize-none" placeholder="z.B. Zollbeamter, Formulare, Besonderheiten…" />
                  </div>
                )}
              </div>
              {/* Einklarieren (arrival) */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <label className="flex items-center gap-2 cursor-pointer p-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <input type="checkbox" {...register('customsClearedIn')} className="w-4 h-4 rounded" />
                  <div>
                    <span className="text-sm font-medium block">Einklariert</span>
                    <span className="text-xs text-gray-500">Zoll im Ankunftshafen erledigt</span>
                  </div>
                </label>
                {customsClearedIn && (
                  <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-700">
                    <label className="label">Notizen Einklarieren</label>
                    <textarea {...register('customsNotesIn')} rows={2} className="input resize-none" placeholder="z.B. Zollbeamter, Formulare, Besonderheiten…" />
                  </div>
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="label">{t('common.notes')}</label>
            <textarea {...register('notes')} rows={3} className="input resize-none" />
          </div>
        </form>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title={t('portLog.deleteConfirmTitle')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDeleteConfirm(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" size="sm" icon={<Trash2 className="w-4 h-4" />} onClick={executeDelete}>{t('common.delete')}</Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <Trash2 className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {deleteConfirm?.type === 'passage'
              ? t('portLog.deletePassageText', { label: deleteConfirm.label })
              : t('portLog.deleteEntryText')
            }
          </p>
        </div>
      </Modal>

      {/* Log entry form modal */}
      <Modal
        isOpen={logModal.open}
        onClose={() => setLogModal({ open: false })}
        title={logModal.entryId ? t('logEntry.editEntry') : t('logEntry.newEntry')}
        size="xl"
      >
        {logModal.open && logModal.passageId && (
          <LogEntryForm
            passageId={logModal.passageId}
            entryId={logModal.entryId}
            onClose={() => setLogModal({ open: false })}
          />
        )}
      </Modal>
    </div>
  )
}
