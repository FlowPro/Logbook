import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { subDays, format, parseISO } from 'date-fns'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { BarChart3, Wind, Navigation, Gauge, Anchor, Thermometer } from 'lucide-react'
import { db } from '../db/database'
import { Card, CardHeader } from '../components/ui/Card'
import { fmtNum } from '../utils/units'
import React from 'react'

type Period = 'yesterday' | 'last7' | 'last30' | 'last90' | 'custom' | 'passage'

function getPeriodDates(period: Exclude<Period, 'passage'>, customStart?: string, customEnd?: string): { start: string; end: string } {
  const today = new Date()
  const end = format(today, 'yyyy-MM-dd')
  switch (period) {
    case 'yesterday': return { start: format(subDays(today, 1), 'yyyy-MM-dd'), end: format(subDays(today, 1), 'yyyy-MM-dd') }
    case 'last7': return { start: format(subDays(today, 7), 'yyyy-MM-dd'), end }
    case 'last30': return { start: format(subDays(today, 30), 'yyyy-MM-dd'), end }
    case 'last90': return { start: format(subDays(today, 90), 'yyyy-MM-dd'), end }
    case 'custom': return { start: customStart ?? format(subDays(today, 30), 'yyyy-MM-dd'), end: customEnd ?? end }
    default: return { start: format(subDays(today, 30), 'yyyy-MM-dd'), end }
  }
}

// Beaufort force → colour (calm=gray, light=green, moderate=yellow, strong=orange, storm=red)
const BFT_COLORS = [
  '#94a3b8', // 0
  '#86efac', // 1
  '#4ade80', // 2
  '#22c55e', // 3
  '#fbbf24', // 4
  '#f59e0b', // 5
  '#f97316', // 6
  '#ea580c', // 7
  '#ef4444', // 8
  '#dc2626', // 9
  '#991b1b', // 10
  '#7f1d1d', // 11
  '#450a0a', // 12
]

// Douglas sea-state 0-9 colours
const DOUGLAS_COLORS = [
  '#94a3b8', // 0 – glassy
  '#86efac', // 1 – rippled
  '#4ade80', // 2 – wavelets
  '#22c55e', // 3 – slight
  '#fbbf24', // 4 – moderate
  '#f59e0b', // 5 – rough
  '#f97316', // 6 – very rough
  '#ef4444', // 7 – high
  '#dc2626', // 8 – very high
  '#991b1b', // 9 – phenomenal
]

const SAIL_COLORS = ['#3b82f6', '#f59e0b']

export function Summary() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<Period>('last30')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [selectedPassageId, setSelectedPassageId] = useState<number | null>(null)

  const passages = useLiveQuery(() =>
    db.passages.orderBy('departureDate').reverse().toArray()
  )

  const selectedPassage = passages?.find(p => p.id === selectedPassageId)
  const { start, end } = period === 'passage' && selectedPassage
    ? { start: selectedPassage.departureDate, end: selectedPassage.arrivalDate }
    : getPeriodDates(period === 'passage' ? 'last30' : period, customStart, customEnd)

  const entries = useLiveQuery(async () => {
    return db.logEntries.where('date').between(start, end, true, true).toArray()
  }, [start, end])

  // ── Core stats ────────────────────────────────────────────
  const stats = entries ? {
    totalNm:     entries.reduce((s, e) => s + (e.distanceSinceLastEntry ?? 0), 0),
    nmSail:      entries.filter(e => !e.engineOn).reduce((s, e) => s + (e.distanceSinceLastEntry ?? 0), 0),
    nmMotor:     entries.filter(e =>  e.engineOn).reduce((s, e) => s + (e.distanceSinceLastEntry ?? 0), 0),
    avgSOG:      (() => { const w = entries.filter(e => e.speedOverGround != null); return w.length ? w.reduce((s, e) => s + (e.speedOverGround ?? 0), 0) / w.length : 0 })(),
    maxSOG:      (() => { const w = entries.filter(e => e.speedOverGround != null); return w.length ? Math.max(...w.map(e => e.speedOverGround ?? 0)) : 0 })(),
    avgWind:     entries.length ? entries.reduce((s, e) => s + e.windTrueSpeed, 0) / entries.length : 0,
    maxWindBft:  entries.length ? Math.max(...entries.map(e => e.windBeaufort)) : 0,
    engineEntries: entries.filter(e => e.engineOn).length,
    entryCount:  entries.length,
  } : null

  // ── Chart data ────────────────────────────────────────────

  // Sail vs. Motor donut
  const sailMotorData = stats && stats.totalNm > 0 ? [
    { name: 'Segel', value: parseFloat(stats.nmSail.toFixed(1)) },
    { name: 'Motor', value: parseFloat(stats.nmMotor.toFixed(1)) },
  ].filter(d => d.value > 0) : []

  // Distance per day
  const distanceByDay = entries ? (() => {
    const map: Record<string, number> = {}
    entries.forEach(e => { map[e.date] = (map[e.date] ?? 0) + (e.distanceSinceLastEntry ?? 0) })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, nm]) => ({
      date: format(parseISO(date), 'dd.MM'),
      nm: parseFloat(nm.toFixed(1)),
    }))
  })() : []

  // Speed + wind (all entries, newest last)
  const speedData = entries?.slice().sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map(e => ({
    time: e.time,
    sog: e.speedOverGround ?? 0,
    wind: e.windTrueSpeed,
  })) ?? []

  // Barometer
  const baroData = entries?.slice().sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map(e => ({
    time: e.time,
    hPa: e.baroPressureHPa,
  })) ?? []

  // Wind rose
  const windRoseData = (() => {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
    const counts = new Array(16).fill(0)
    entries?.forEach(e => { if (e.windTrueDirection != null) counts[Math.round(e.windTrueDirection / 22.5) % 16]++ })
    return dirs.map((dir, i) => ({ dir, count: counts[i] }))
  })()

  // Beaufort distribution (0–12)
  const beaufortDist = (() => {
    const counts = new Array(13).fill(0)
    entries?.forEach(e => { if (e.windBeaufort >= 0 && e.windBeaufort <= 12) counts[e.windBeaufort]++ })
    return counts.map((count, bft) => ({ label: String(bft), bftNum: bft, count }))
  })()

  // Douglas sea-state distribution (0–9)
  const douglasDist = (() => {
    const counts = new Array(10).fill(0)
    entries?.forEach(e => { if (e.seaStateBeaufort >= 0 && e.seaStateBeaufort <= 9) counts[e.seaStateBeaufort]++ })
    return counts.map((count, ds) => ({ label: String(ds), dsNum: ds, count }))
  })()

  // Mooring status distribution
  const mooringDistData = (() => {
    if (!entries) return []
    const counts: Record<string, number> = {
      underway: 0, anchored: 0, moored_marina: 0, moored_buoy: 0, moored_alongside: 0,
    }
    entries.forEach(e => {
      const key = e.mooringStatus ?? 'underway'
      counts[key] = (counts[key] ?? 0) + 1
    })
    const MOORING_LABELS: Record<string, string> = {
      underway: 'Unterwegs', anchored: 'Vor Anker',
      moored_marina: 'Hafen', moored_buoy: 'Boje', moored_alongside: 'Längsseits',
    }
    const MOORING_COLORS_MAP: Record<string, string> = {
      underway: '#3b82f6', anchored: '#14b8a6',
      moored_marina: '#0d9488', moored_buoy: '#0891b2', moored_alongside: '#0e7490',
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ name: MOORING_LABELS[key] ?? key, value, color: MOORING_COLORS_MAP[key] ?? '#94a3b8' }))
  })()
  const hasMooringData = mooringDistData.length > 1 || (mooringDistData.length === 1 && mooringDistData[0].name !== 'Unterwegs')

  // Temperature trend (only if data exists)
  const tempData = entries?.filter(e => e.temperature != null)
    .slice().sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .map(e => ({ time: `${e.date} ${e.time}`, temp: e.temperature! })) ?? []

  const hasTempData = tempData.length > 0

  // ── Period selector ────────────────────────────────────────
  const periods: Array<{ value: Period; label: string }> = [
    { value: 'yesterday', label: t('summary.yesterday') },
    { value: 'last7',     label: t('summary.last7') },
    { value: 'last30',    label: t('summary.last30') },
    { value: 'last90',    label: t('summary.last90') },
    { value: 'passage',   label: 'Passage' },
    { value: 'custom',    label: t('summary.custom') },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('summary.title')}</h1>

      {/* Period selector */}
      <Card>
        <div className="flex flex-wrap gap-2">
          {periods.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p.value ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex gap-4 mt-3">
            <div>
              <label className="label">Von</label>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Bis</label>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input" />
            </div>
          </div>
        )}
        {period === 'passage' && (
          <div className="mt-3">
            <label className="label">Passage auswählen</label>
            {passages && passages.length > 0 ? (
              <select
                value={selectedPassageId ?? ''}
                onChange={e => setSelectedPassageId(e.target.value ? Number(e.target.value) : null)}
                className="input"
              >
                <option value="">— Passage wählen —</option>
                {passages.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.departurePort} → {p.arrivalPort} ({p.departureDate} – {p.arrivalDate})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-400 italic">Noch keine Passagen erfasst.</p>
            )}
            {selectedPassage && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <Anchor className="w-3 h-3 flex-shrink-0" />
                <span>
                  {selectedPassage.departurePort} → {selectedPassage.arrivalPort} ·{' '}
                  {selectedPassage.departureDate} bis {selectedPassage.arrivalDate}
                </span>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* KPI tiles */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {([
            {
              label: t('summary.totalNm'),
              value: `${fmtNum(stats.totalNm)} nm`,
              sub: `${stats.entryCount} Einträge`,
              icon: <Navigation className="w-4 h-4" />,
              color: 'blue',
            },
            {
              label: 'Unter Segel',
              value: `${fmtNum(stats.nmSail)} nm`,
              sub: stats.totalNm > 0 ? `${Math.round(stats.nmSail / stats.totalNm * 100)} %` : '—',
              icon: <Anchor className="w-4 h-4" />,
              color: 'blue',
            },
            {
              label: 'Unter Motor',
              value: `${fmtNum(stats.nmMotor)} nm`,
              sub: stats.totalNm > 0 ? `${Math.round(stats.nmMotor / stats.totalNm * 100)} %` : '—',
              icon: <Gauge className="w-4 h-4" />,
              color: 'amber',
            },
            {
              label: t('summary.avgSOG'),
              value: `${stats.avgSOG.toFixed(1)} kn`,
              sub: `Max ${stats.maxSOG.toFixed(1)} kn`,
              icon: <Gauge className="w-4 h-4" />,
              color: 'blue',
            },
            {
              label: 'Max. Wind',
              value: `Bft ${stats.maxWindBft}`,
              sub: `Ø ${stats.avgWind.toFixed(1)} kn`,
              icon: <Wind className="w-4 h-4" />,
              color: stats.maxWindBft >= 8 ? 'red' : stats.maxWindBft >= 6 ? 'orange' : 'blue',
            },
            {
              label: 'Motor-Einträge',
              value: String(stats.engineEntries),
              sub: stats.entryCount > 0 ? `${Math.round(stats.engineEntries / stats.entryCount * 100)} %` : '—',
              icon: <BarChart3 className="w-4 h-4" />,
              color: 'blue',
            },
          ] as const).map(item => (
            <div key={item.label} className="card p-3">
              <div className={`mb-2 ${
                item.color === 'amber' ? 'text-amber-500' :
                item.color === 'red'   ? 'text-red-600 dark:text-red-400' :
                item.color === 'orange'? 'text-orange-500' :
                'text-blue-600 dark:text-blue-400'
              }`}>
                {item.icon}
              </div>
              <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{item.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
              {item.sub && <div className="text-xs text-gray-400 mt-0.5">{item.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {entries && entries.length === 0 && (
        <Card><div className="text-center py-8 text-gray-500">{t('summary.noData')}</div></Card>
      )}

      {entries && entries.length > 0 && (
        <div className="grid md:grid-cols-2 gap-6">

          {/* Row 1: Strecke pro Tag + Geschwindigkeit */}
          <Card>
            <CardHeader title={t('summary.distanceChart')} />
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={distanceByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit=" nm" tickFormatter={(v: number) => Number.isInteger(v) ? String(v) : v.toFixed(1)} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} nm`, 'Distanz']} />
                <Bar dataKey="nm" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader title={t('summary.speedChart')} />
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={speedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={false} />
                <YAxis tick={{ fontSize: 10 }} unit=" kn" tickFormatter={(v: number) => Number.isInteger(v) ? String(v) : v.toFixed(1)} />
                <Tooltip formatter={(v, n) => [`${Number(v).toFixed(1)} kn`, n === 'sog' ? 'SOG' : 'Wind']} />
                <Line type="monotone" dataKey="sog"  stroke="#3b82f6" dot={false} strokeWidth={2} name="sog" />
                <Line type="monotone" dataKey="wind" stroke="#f59e0b" dot={false} strokeWidth={2} name="wind" strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Row 2: Beaufort + Seegang */}
          <Card>
            <CardHeader title="Beaufort-Verteilung" />
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={beaufortDist}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} label={{ value: 'Bft', position: 'insideBottomRight', offset: 0, fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v} Einträge`, 'Anzahl']} labelFormatter={(l) => `Beaufort ${l}`} />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {beaufortDist.map((entry, i) => <Cell key={i} fill={BFT_COLORS[entry.bftNum]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader title="Seegang-Verteilung (Douglas)" />
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={douglasDist}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} label={{ value: 'DS', position: 'insideBottomRight', offset: 0, fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v} Einträge`, 'Anzahl']} labelFormatter={(l) => `Douglas ${l}`} />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {douglasDist.map((entry, i) => <Cell key={i} fill={DOUGLAS_COLORS[entry.dsNum]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Row 3: Luftdruckverlauf + Temperaturverlauf */}
          <Card>
            <CardHeader title={t('summary.baroChart')} />
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={baroData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit=" hPa" domain={['dataMin - 5', 'dataMax + 5']} tickFormatter={(v: number) => String(Math.round(v))} />
                <Tooltip formatter={(v) => [`${Math.round(Number(v))} hPa`, 'Luftdruck']} />
                <Line type="monotone" dataKey="hPa" stroke="#8b5cf6" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader title="Temperaturverlauf" icon={<Thermometer className="w-4 h-4" />} />
            {hasTempData ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={tempData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" tick={false} />
                  <YAxis tick={{ fontSize: 10 }} unit=" °C" domain={['dataMin - 2', 'dataMax + 2']} tickFormatter={(v: number) => Number.isInteger(v) ? String(v) : v.toFixed(1)} />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} °C`, 'Temperatur']} />
                  <Line type="monotone" dataKey="temp" stroke="#f43f5e" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">Keine Temperaturdaten im gewählten Zeitraum</div>
            )}
          </Card>

          {/* Row 4: Segel vs. Motor + Liegestatus */}
          <Card>
            <CardHeader title="Segel vs. Motor" />
            {sailMotorData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={sailMotorData} cx="50%" cy="48%" innerRadius={52} outerRadius={78} dataKey="value"
                    label={({ percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ''} labelLine={false}>
                    {sailMotorData.map((_, i) => <Cell key={i} fill={SAIL_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} nm`]} />
                  <Legend formatter={(name, entry) => `${name}: ${(entry.payload as { value: number }).value.toFixed(1)} nm`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">Keine Streckendaten</div>
            )}
          </Card>

          <Card>
            <CardHeader title="Liegestatus" icon={<Anchor className="w-4 h-4" />} />
            {mooringDistData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={mooringDistData} cx="50%" cy="48%" innerRadius={52} outerRadius={78} dataKey="value"
                    label={({ percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ''} labelLine={false}>
                    {mooringDistData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} Einträge`]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">Keine Liegestatuseinträge</div>
            )}
          </Card>

          {/* Row 5: Windrose – volle Breite */}
          <Card className="md:col-span-2">
            <CardHeader title={t('summary.windRose')} />
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={windRoseData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="dir" tick={{ fontSize: 9 }} />
                <Radar name="Wind" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
              </RadarChart>
            </ResponsiveContainer>
          </Card>

        </div>
      )}
    </div>
  )
}
