import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, Trash2 } from 'lucide-react'
import type { NMEAData } from '../../hooks/useNMEA'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedMsg {
  type: string
  _raw?: string
  latitude?: number
  longitude?: number
  sog?: number
  cogTrue?: number
  windApparentAngle?: number
  windApparentSpeed?: number
  windTrueAngle?: number
  windTrueDirection?: number
  windTrueSpeed?: number
  baroPressureHPa?: number
  temperature?: number
  depth?: number
  [key: string]: unknown
}

interface LogEntry {
  ts: number
  msg: ParsedMsg
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function secsAgo(ts: number, nowLabel: string): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return nowLabel
  if (s < 60) return `${s}s`
  return `${Math.round(s / 60)}m`
}

/** Extract 3-letter sentence ID from raw NMEA string, e.g. "$GPRMC,…" → "RMC" */
function sentenceId(raw?: string): string {
  if (!raw) return '?'
  const m = raw.match(/^\$\w{2}(\w{3})/)
  return m ? m[1] : raw.substring(1, 4)
}

/** Return the raw NMEA sentence content, stripping the $XXYYYY, header and *XX checksum */
function rawContent(raw?: string): string {
  if (!raw) return '—'
  return raw
    .replace(/^\$\w+,/, '')   // strip $GPXXX, / $SDXXX, etc.
    .replace(/\*[0-9A-Fa-f]{2}$/, '')  // strip *checksum
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NMEADebugPanel({
  nmeaConnected,
  liveData,
}: {
  nmeaConnected?: boolean
  liveData?: NMEAData
}) {
  const { t } = useTranslation()
  const [log, setLog] = useState<LogEntry[]>([])
  const [, forceUpdate] = useState(0)
  const prevUpdatedAt = useRef<number | undefined>()

  // Re-render every 5 s so "X ago" timestamps stay fresh
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 5000)
    return () => clearInterval(id)
  }, [])

  // Build message log from liveData changes (avoids a duplicate WS connection).
  // Only capture _raw and type — liveData is an accumulated state so all other
  // fields would show stale values from previous sentence types (e.g. a $DBT
  // entry would show lat/lon from the last $RMC).
  const addLogEntry = useCallback((data: NMEAData) => {
    const msg: ParsedMsg = {
      type: data.type ?? '?',
      _raw: data._raw,
    }
    setLog(prev => [{ ts: data.updatedAt ?? Date.now(), msg }, ...prev.slice(0, 99)])
  }, [])

  useEffect(() => {
    const ts = liveData?.updatedAt
    if (!ts || ts === prevUpdatedAt.current) return
    prevUpdatedAt.current = ts
    if (liveData) addLogEntry(liveData)
  }, [liveData, addLogEntry])

  const now = Date.now()
  const msgsPerMin = log.filter(e => now - e.ts < 60_000).length
  const lastTs = log[0]?.ts

  const hasData = (liveData?.updatedAt !== undefined) || log.length > 0

  // Current values come from liveData (useNMEA hook – reliable) with log as fallback
  const d = liveData ?? {}

  const valueRows: Array<{ label: string; value: string | undefined }> = [
    {
      label: 'Position',
      value: d.latitude !== undefined && d.longitude !== undefined
        ? `${d.latitude.toFixed(5)}° · ${d.longitude.toFixed(5)}°`
        : undefined,
    },
    {
      label: 'SOG / COG',
      value: d.sog !== undefined
        ? `${d.sog.toFixed(1)} kn${d.cogTrue !== undefined ? `  ·  ${d.cogTrue.toFixed(0)}°` : ''}`
        : undefined,
    },
    {
      label: t('nmea.windApparent'),
      value: d.windApparentAngle !== undefined
        ? `${d.windApparentAngle.toFixed(0)}°  ·  ${(d.windApparentSpeed ?? 0).toFixed(1)} kn`
        : undefined,
    },
    {
      label: t('nmea.windTrue'),
      value: d.windTrueDirection !== undefined
        ? `${d.windTrueDirection.toFixed(0)}°  ·  ${(d.windTrueSpeed ?? 0).toFixed(1)} kn`
        : undefined,
    },
    {
      label: t('nmea.pressure'),
      value: d.baroPressureHPa !== undefined
        ? `${d.baroPressureHPa.toFixed(0)} hPa${d.temperature !== undefined ? `  ·  ${d.temperature.toFixed(1)} °C` : ''}`
        : undefined,
    },
    {
      label: t('nmea.depth'),
      value: d.depth !== undefined ? `${d.depth.toFixed(1)} m` : undefined,
    },
  ]

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-600 dark:text-gray-300">{t('nmea.liveData')}</span>
        </div>
        <div className="flex items-center gap-3">
          {hasData && (
            <>
              <span className="text-gray-500">
                <span className="font-semibold text-gray-700 dark:text-gray-300">{msgsPerMin}</span> msg/min
              </span>
              {lastTs && (
                <span className="text-gray-400">{t('nmea.lastBefore')} {secsAgo(lastTs, t('nmea.now'))}</span>
              )}
              <button
                type="button"
                onClick={() => setLog([])}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title={t('nmea.clearLog')}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Empty state ── */}
      {!hasData && (
        <div className="flex items-center justify-center gap-2 px-3 py-5 text-gray-400">
          {nmeaConnected !== false ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              {t('nmea.waitingNmea')}
            </>
          ) : (
            t('nmea.noSignal')
          )}
        </div>
      )}

      {hasData && (
        <>
          {/* ── Current values ── */}
          <div className="px-3 py-2.5 grid grid-cols-2 gap-x-6 gap-y-1.5 border-b border-gray-100 dark:border-gray-700">
            {valueRows.map(({ label, value }) => (
              <div key={label} className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-gray-400 shrink-0 w-20">{label}</span>
                {value
                  ? <span className="font-mono text-gray-800 dark:text-gray-100 truncate">{value}</span>
                  : <span className="text-gray-300 dark:text-gray-600">—</span>}
              </div>
            ))}
          </div>

          {/* ── Message log ── */}
          <div className="max-h-52 overflow-y-auto">
            <div className="px-3 py-1 text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              {t('nmea.recentMessages')}
            </div>
            {log.slice(0, 30).map((entry, i) => (
              <div
                key={i}
                className="flex items-baseline gap-2 px-3 py-1 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
              >
                <span className="text-gray-300 dark:text-gray-600 w-8 shrink-0 text-right tabular-nums">
                  {secsAgo(entry.ts, t('nmea.now'))}
                </span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400 w-8 shrink-0">
                  {sentenceId(entry.msg._raw)}
                </span>
                <span className="font-mono text-gray-600 dark:text-gray-400 truncate">
                  {rawContent(entry.msg._raw)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
