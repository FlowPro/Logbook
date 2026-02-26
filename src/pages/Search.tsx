import { useState, useMemo, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Search as SearchIcon, MapPin, FileText, Wrench, X, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/database'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import type { PassageEntry, LogEntry, MaintenanceEntry } from '../db/models'

// ── Query parser ──────────────────────────────────────────────────────────────
interface ParsedQuery {
  free: string
  port?: string
  country?: string
  crew?: string
  cat?: string
  bft?: number
  date?: string
}

function parseQuery(raw: string): ParsedQuery {
  const q: ParsedQuery = { free: '' }
  const freeWords: string[] = []

  for (const token of raw.trim().split(/\s+/)) {
    const ci = token.indexOf(':')
    if (ci > 0) {
      const key = token.slice(0, ci).toLowerCase()
      const val = token.slice(ci + 1).toLowerCase()
      if (key === 'port') q.port = val
      else if (key === 'country') q.country = val
      else if (key === 'crew') q.crew = val
      else if (key === 'cat') q.cat = val
      else if (key === 'bft') q.bft = parseInt(val)
      else if (key === 'date') q.date = val
      else if (token) freeWords.push(token.toLowerCase())
    } else if (token) {
      freeWords.push(token.toLowerCase())
    }
  }

  q.free = freeWords.join(' ')
  return q
}

// ── Filter functions ──────────────────────────────────────────────────────────
function matchesPassage(p: PassageEntry, q: ParsedQuery): boolean {
  // Operators that only apply to other result types → exclude passages
  if (q.cat !== undefined || q.crew !== undefined || q.bft !== undefined) return false
  const text = `${p.departurePort} ${p.arrivalPort} ${p.departureCountry ?? ''} ${p.arrivalCountry ?? ''} ${p.notes ?? ''}`.toLowerCase()
  if (q.free && !text.includes(q.free)) return false
  if (q.port && !`${p.departurePort} ${p.arrivalPort}`.toLowerCase().includes(q.port)) return false
  if (q.country && !`${p.departureCountry ?? ''} ${p.arrivalCountry ?? ''}`.toLowerCase().includes(q.country)) return false
  if (q.date && !`${p.departureDate} ${p.arrivalDate}`.includes(q.date)) return false
  return true
}

function matchesEntry(e: LogEntry, q: ParsedQuery): boolean {
  // Operators that only apply to other result types → exclude log entries
  if (q.port || q.country || q.cat !== undefined) return false
  const crewStr = (e.crewOnWatch ?? []).join(' ')
  const text = `${e.date} ${e.time} ${e.notes ?? ''} ${e.watchOfficer ?? ''} ${crewStr}`.toLowerCase()
  if (q.free && !text.includes(q.free)) return false
  if (q.crew) {
    const needle = q.crew
    const inOfficer = (e.watchOfficer ?? '').toLowerCase().includes(needle)
    const inCrew = (e.crewOnWatch ?? []).some(n => n.toLowerCase().includes(needle))
    if (!inOfficer && !inCrew) return false
  }
  if (q.bft !== undefined && e.windBeaufort !== q.bft) return false
  if (q.date && !e.date.includes(q.date)) return false
  return true
}

function matchesMaintenance(m: MaintenanceEntry, q: ParsedQuery): boolean {
  // Operators that only apply to other result types → exclude maintenance
  if (q.port || q.country || q.crew !== undefined || q.bft !== undefined) return false
  const text = `${m.date} ${m.category} ${m.description ?? ''} ${m.performedBy ?? ''} ${m.notes ?? ''}`.toLowerCase()
  if (q.free && !text.includes(q.free)) return false
  if (q.cat && !m.category.toLowerCase().includes(q.cat)) return false
  if (q.date && !(m.date ?? '').includes(q.date)) return false
  return true
}

const MAX = 30

const OPERATORS = [
  { op: 'port:Hamburg', desc: 'Hafen (Abfahrt oder Ankunft)' },
  { op: 'country:Portugal', desc: 'Land' },
  { op: 'crew:Schmidt', desc: 'Wachoffizier' },
  { op: 'bft:7', desc: 'Beaufort-Stärke (exakt)' },
  { op: 'cat:motor', desc: 'Wartungskategorie' },
  { op: 'date:2024-06', desc: 'Datum (Prefix)' },
]

// ── Component ─────────────────────────────────────────────────────────────────
export function Search() {
  const navigate = useNavigate()
  const [rawQuery, setRawQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 300 ms debounce — UI updates instantly, DB queries wait
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!rawQuery.trim()) { setDebouncedQuery(''); return }
    debounceRef.current = setTimeout(() => setDebouncedQuery(rawQuery), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [rawQuery])

  const q = useMemo(() => parseQuery(debouncedQuery), [debouncedQuery])
  const hasQuery = debouncedQuery.trim().length > 0

  // Log entries: use DB-level date index when date: operator is present
  const entries = useLiveQuery(async () => {
    if (!hasQuery) return []
    if (q.date && q.date.length >= 4) {
      // [date] is indexed → O(log n) prefix scan
      return db.logEntries.where('date').startsWith(q.date).toArray()
    }
    return db.logEntries.toArray()
  }, [hasQuery, q.date]) ?? []

  // Passages and maintenance load only when a query is active
  const passages = useLiveQuery(() => hasQuery ? db.passages.toArray() : [], [hasQuery]) ?? []
  const maintenance = useLiveQuery(() => hasQuery ? db.maintenance.toArray() : [], [hasQuery]) ?? []

  const filteredPassages = useMemo<PassageEntry[]>(() => {
    if (!hasQuery) return []
    return passages.filter(p => matchesPassage(p, q)).slice(0, MAX)
  }, [passages, q, hasQuery])

  const filteredEntries = useMemo<LogEntry[]>(() => {
    if (!hasQuery) return []
    return entries
      .filter(e => matchesEntry(e, q))
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
      .slice(0, MAX)
  }, [entries, q, hasQuery])

  const filteredMaintenance = useMemo<MaintenanceEntry[]>(() => {
    if (!hasQuery) return []
    return maintenance
      .filter(m => matchesMaintenance(m, q))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, MAX)
  }, [maintenance, q, hasQuery])

  const totalResults = filteredPassages.length + filteredEntries.length + filteredMaintenance.length

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Suche</h1>

      {/* Search input */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={rawQuery}
          onChange={e => setRawQuery(e.target.value)}
          placeholder="Hafen, Crew, Datum … oder port:Hamburg bft:7"
          className="w-full pl-10 pr-10 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        {rawQuery && (
          <button
            onClick={() => setRawQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Operator help (shown when idle) */}
      {!hasQuery && (
        <Card>
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">Such-Operatoren</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {OPERATORS.map(({ op, desc }) => (
              <button
                key={op}
                onClick={() => setRawQuery(op + ' ')}
                className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <code className="text-xs font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap">{op}</code>
                <span className="text-xs text-gray-500">{desc}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Operatoren kombinierbar, z.B.{' '}
            <code className="font-mono text-blue-500">port:Hamburg bft:6</code>
          </p>
        </Card>
      )}

      {/* Results */}
      {hasQuery && (
        <div className="space-y-5">
          {totalResults === 0 ? (
            <p className="text-gray-500 text-center py-8">Keine Ergebnisse für „{rawQuery}"</p>
          ) : (
            <p className="text-sm text-gray-500">{totalResults} Ergebnis{totalResults !== 1 ? 'se' : ''}</p>
          )}

          {/* Passages */}
          {filteredPassages.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                Passagen ({filteredPassages.length}{filteredPassages.length === MAX ? '+' : ''})
              </h2>
              <div className="space-y-2">
                {filteredPassages.map(p => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/ports?passage=${p.id}`)}
                    className="w-full text-left p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.departurePort} → {p.arrivalPort}</div>
                      <div className="text-sm text-gray-500">
                        {p.departureDate} – {p.arrivalDate}
                        {(p.departureCountry || p.arrivalCountry) && (
                          <span className="ml-2 text-gray-400">
                            {p.departureCountry} → {p.arrivalCountry}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Log entries */}
          {filteredEntries.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Logeinträge ({filteredEntries.length}{filteredEntries.length === MAX ? '+' : ''})
              </h2>
              <div className="space-y-2">
                {filteredEntries.map(e => (
                  <button
                    key={e.id}
                    onClick={() => navigate(`/log/${e.id}/edit`)}
                    className="w-full text-left p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-medium">{e.date} {e.time} UTC</div>
                      <div className="text-sm text-gray-500 flex items-center gap-2 flex-wrap mt-0.5">
                        <Badge variant="beaufort" beaufortForce={e.windBeaufort} />
                        {e.watchOfficer && <span>Wache: {e.watchOfficer}</span>}
                        {e.notes && <span className="truncate max-w-xs italic">{e.notes}</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Maintenance */}
          {filteredMaintenance.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" />
                Wartung ({filteredMaintenance.length}{filteredMaintenance.length === MAX ? '+' : ''})
              </h2>
              <div className="space-y-2">
                {filteredMaintenance.map(m => (
                  <button
                    key={m.id}
                    onClick={() => navigate('/maintenance')}
                    className="w-full text-left p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{m.category} — {m.date}</div>
                      {m.description && (
                        <div className="text-sm text-gray-500 truncate">{m.description}</div>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
