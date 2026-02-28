import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import {
  MapPin, Navigation, Wind, Gauge, Users, FileText,
  ChevronDown, ChevronUp, Copy, Loader2, Save, ArrowLeft, Anchor,
  Ship, Building2, CircleDot, GitCommitHorizontal, X,
} from 'lucide-react'
import { db } from '../db/database'
import { useLiveQuery } from 'dexie-react-hooks'
import type { LogEntry, Coordinate, DocumentAttachment, PressureTrend, MooringStatus } from '../db/models'
import { SailDiagram } from '../components/ui/SailDiagram'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { CoordinateInput } from '../components/ui/CoordinateInput'
import { BeaufortPicker } from '../components/ui/BeaufortPicker'
import { OktasPicker } from '../components/ui/OktasPicker'
import { FileUpload } from '../components/ui/FileUpload'
import { gpsToCoordinates, haversineDistance, coordToDecimal, decimalToCoord } from '../utils/geo'
import { useSettings } from '../hooks/useSettings'
import { useShip } from '../hooks/useShip'
import { useNMEAContext } from '../contexts/NMEAContext'
import type { NMEAData } from '../hooks/useNMEA'
import { NMEAImportButton } from '../components/ui/NMEAImportPanel'
import React from 'react'

// Preprocess: empty/NaN → undefined; otherwise parse as number
const optNum = (min: number, max: number) =>
  z.preprocess(
    v => (v === '' || v === null || v === undefined || (typeof v === 'number' && isNaN(v))) ? undefined : Number(v),
    z.number().min(min).max(max).optional()
  )

const coordinateSchema = z.object({
  degrees: z.number().min(0).max(180),
  minutes: z.number().min(0).max(59.999),
  direction: z.enum(['N', 'S', 'E', 'W']),
})

const schema = z.object({
  passageId: z.number().int().positive(),
  date: z.string().min(1),
  time: z.string().min(1),
  latitude: coordinateSchema,
  longitude: coordinateSchema,
  courseTrue: optNum(0, 360),
  courseMagnetic: optNum(0, 360),
  speedOverGround: optNum(0, 50),
  speedThroughWater: optNum(0, 50),
  distanceSinceLastEntry: z.number().min(0),
  windTrueDirection: optNum(0, 360),
  windTrueSpeed: z.number().min(0).max(150),
  windBeaufort: z.number().min(0).max(12),
  windApparentDirection: optNum(0, 360),
  windApparentSpeed: optNum(0, 150),
  seaStateBeaufort: z.number().min(0).max(9),
  swellHeightM: z.number().min(0).max(30),
  swellDirection: optNum(0, 360),
  baroPressureHPa: z.number().min(900).max(1100),
  pressureTrend: z.enum(['rising', 'steady', 'falling', 'rising_rapidly', 'falling_rapidly']),
  visibility: z.enum(['excellent', 'good', 'moderate', 'poor', 'fog']),
  cloudCoverOktas: z.number().min(0).max(8).optional(),
  weatherDescription: z.string(),
  temperature: z.preprocess(
    v => (v === '' || v === null || v === undefined || (typeof v === 'number' && isNaN(v))) ? undefined : Number(v),
    z.number().optional()
  ),
  engineOn: z.boolean(),
  engineHoursTotal: z.preprocess(
    v => (v === '' || v === null || v === undefined || (typeof v === 'number' && isNaN(v))) ? undefined : Number(v),
    z.number().min(0).optional()
  ),
  fuelLevelL: z.number().min(0).max(100).optional(),
  waterLevelL: z.number().min(0).max(100).optional(),
  mainsailState: z.enum(['none', 'full', 'reef1', 'reef2', 'reef3', 'reef4']),
  genoa: z.enum(['none', 'full', 'reef1', 'reef2', 'reef3']),
  staysail: z.enum(['none', 'full', 'reef1', 'reef2', 'reef3']),
  lightSail: z.enum(['none', 'code0', 'gennaker', 'parasail']),
  mooringStatus: z.enum(['underway', 'anchored', 'moored_marina', 'moored_buoy', 'moored_alongside']).optional(),
  watchOfficer: z.string(),
  crewOnWatch: z.array(z.string()),
  notes: z.string(),
})

type FormData = z.infer<typeof schema>

const makeDefaults = (passageId: number): FormData => ({
  passageId,
  date: format(new Date(), 'yyyy-MM-dd'),
  time: format(new Date(), 'HH:mm'),
  latitude: { degrees: 0, minutes: 0, direction: 'N' },
  longitude: { degrees: 0, minutes: 0, direction: 'E' },
  // courseTrue, courseMagnetic, speedOverGround, speedThroughWater intentionally omitted (optional)
  distanceSinceLastEntry: 0,
  // windTrueDirection, windApparentDirection, windApparentSpeed, swellDirection intentionally omitted (optional)
  windTrueSpeed: 0,
  windBeaufort: 0,
  seaStateBeaufort: 0,
  swellHeightM: 0,
  baroPressureHPa: 1013,
  pressureTrend: 'steady',
  visibility: 'good',
  // cloudCoverOktas intentionally omitted (optional)
  weatherDescription: '',
  engineOn: false,
  // engineRPM, engineHoursTotal, fuelLevelL, waterLevelL, temperature intentionally omitted (optional)
  mainsailState: 'none' as const,
  genoa: 'none' as const,
  staysail: 'none' as const,
  lightSail: 'none' as const,
  watchOfficer: '',
  crewOnWatch: [],
  notes: '',
})

interface SectionProps {
  title: string
  icon: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}

function Section({ title, icon, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-blue-50 dark:bg-blue-950 rounded-lg text-blue-600 dark:text-blue-400">
            {icon}
          </div>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-100 dark:border-gray-700">
          <div className="pt-4 space-y-4">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

function knotsToBeaufort(kts: number): number {
  if (kts < 1) return 0
  if (kts <= 3) return 1
  if (kts <= 6) return 2
  if (kts <= 10) return 3
  if (kts <= 15) return 4
  if (kts <= 21) return 5
  if (kts <= 27) return 6
  if (kts <= 33) return 7
  if (kts <= 40) return 8
  if (kts <= 47) return 9
  if (kts <= 55) return 10
  if (kts <= 63) return 11
  return 12
}

function metersToSeaState(m: number): number {
  if (!Number.isFinite(m) || m < 0) return 0
  if (m === 0) return 0
  if (m <= 0.1) return 1
  if (m <= 0.5) return 2
  if (m <= 1.25) return 3
  if (m <= 2.5) return 4
  if (m <= 4.0) return 5
  if (m <= 6.0) return 6
  if (m <= 9.0) return 7
  if (m <= 14.0) return 8
  return 9
}

function PressureTrendBadge({ current, lastBaro }: { current: number; lastBaro?: number }) {
  if (lastBaro === undefined) {
    return <span className="text-sm text-gray-400 italic">—</span>
  }
  const diff = current - lastBaro
  let icon: string, label: string, cls: string
  if (diff > 3)        { icon = '↑↑'; label = `+${diff.toFixed(1)}`; cls = 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950' }
  else if (diff > 0.5) { icon = '↑';  label = `+${diff.toFixed(1)}`; cls = 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950' }
  else if (diff < -3)  { icon = '↓↓'; label = diff.toFixed(1);       cls = 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950' }
  else if (diff < -0.5){ icon = '↓';  label = diff.toFixed(1);       cls = 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950' }
  else                 { icon = '→';  label = '±0';                  cls = 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800' }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-semibold ${cls}`}>
      <span className="text-base leading-none">{icon}</span>
      <span>{label} hPa</span>
    </span>
  )
}

// ── Sail picker helpers ───────────────────────────────────────────────────────
function SailRow({ label, color, children }: { label: string; color: 'blue' | 'purple'; children: React.ReactNode }) {
  return (
    <div>
      <p className={`text-xs font-medium mb-1.5 ${color === 'purple' ? 'text-purple-600 dark:text-purple-400' : 'text-blue-600 dark:text-blue-400'}`}>
        {label}
      </p>
      {children}
    </div>
  )
}

function SailButtons({ value, onChange, options, color }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  color: 'blue' | 'purple'
}) {
  const activeClass = color === 'purple'
    ? 'bg-purple-600 text-white'
    : 'bg-blue-600 text-white'
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            value === opt.value
              ? activeClass
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

const MOORING_OPTIONS: Array<{ value: MooringStatus; icon: React.ElementType; colorActive: string }> = [
  { value: 'underway',        icon: Ship,                 colorActive: 'bg-blue-600 text-white' },
  { value: 'anchored',        icon: Anchor,               colorActive: 'bg-teal-600 text-white' },
  { value: 'moored_marina',   icon: Building2,            colorActive: 'bg-teal-600 text-white' },
  { value: 'moored_buoy',     icon: CircleDot,            colorActive: 'bg-teal-600 text-white' },
  { value: 'moored_alongside',icon: GitCommitHorizontal,  colorActive: 'bg-teal-600 text-white' },
]

export function LogEntryForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const [searchParams] = useSearchParams()
  const isEdit = !!id

  const [attachments, setAttachments] = useState<DocumentAttachment[]>([])
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState('')
  const [saving, setSaving] = useState(false)
  const [resolvedPassageId, setResolvedPassageId] = useState<number | null>(null)

  const { settings } = useSettings()
  const { ship } = useShip()
  const { connected: nmeaConnected, data: nmeaData } = useNMEAContext()

  const existingEntry = useLiveQuery(
    () => id ? db.logEntries.get(parseInt(id)) : undefined,
    [id]
  )
  const passage = useLiveQuery(
    () => resolvedPassageId ? db.passages.get(resolvedPassageId) : undefined,
    [resolvedPassageId]
  )
  const lastEntryForPassage = useLiveQuery(
    async () => {
      if (!resolvedPassageId) return null
      const entries = await db.logEntries.where('passageId').equals(resolvedPassageId).toArray()
      entries.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
      // In edit mode, exclude the current entry so we compare against the previous one
      const filtered = isEdit && id ? entries.filter(e => e.id !== parseInt(id)) : entries
      return filtered[filtered.length - 1] ?? null
    },
    [resolvedPassageId, isEdit, id]
  )
  const activeCrew = useLiveQuery(() => db.crew.filter(c => c.isActive).toArray())

  // Returns label with a subtle NMEA badge when NMEA integration is active
  function nmLabel(label: string): React.ReactNode {
    if (!settings?.nmeaEnabled) return label
    return (
      <>
        {label}{' '}
        <span className="text-teal-500 text-[9px] font-semibold tracking-wide uppercase opacity-80">NMEA</span>
      </>
    )
  }

  // Determine passageId from URL param (new) or existing entry (edit)
  useEffect(() => {
    if (isEdit) {
      // Wait for Dexie to load the entry before resolving passageId
      if (existingEntry) {
        setResolvedPassageId(existingEntry.passageId)
      }
      // existingEntry === undefined means still loading → do nothing yet
    } else {
      const param = searchParams.get('passageId')
      if (param) {
        setResolvedPassageId(parseInt(param))
      } else {
        navigate('/ports', { replace: true })
      }
    }
  }, [isEdit, existingEntry, searchParams, navigate])

  const { control, register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: makeDefaults(resolvedPassageId ?? 0),
  })

  const engineOn = watch('engineOn')
  const mainsailState = watch('mainsailState')
  const genoa = watch('genoa')
  const staysail = watch('staysail')
  const lightSail = watch('lightSail')
  const windTrueSpeed = watch('windTrueSpeed')
  const swellHeightM = watch('swellHeightM')
  const baroPressureHPa = watch('baroPressureHPa')

  // Auto-compute Beaufort from true wind speed
  useEffect(() => {
    setValue('windBeaufort', knotsToBeaufort(windTrueSpeed ?? 0))
  }, [windTrueSpeed, setValue])

  // Auto-compute sea state from swell height
  useEffect(() => {
    setValue('seaStateBeaufort', metersToSeaState(swellHeightM ?? 0))
  }, [swellHeightM, setValue])

  // Sync passageId into form whenever resolved
  useEffect(() => {
    if (resolvedPassageId) setValue('passageId', resolvedPassageId)
  }, [resolvedPassageId, setValue])

  // Populate form from existing entry (edit mode)
  useEffect(() => {
    if (isEdit && existingEntry) {
      // Load all known defaults first (required fields)
      const defaults = makeDefaults(existingEntry.passageId)
      const keys = Object.keys(defaults) as (keyof FormData)[]
      keys.forEach(field => {
        const val = (existingEntry as any)[field]
        if (val !== undefined) setValue(field, val)
      })
      // Also load optional fields omitted from makeDefaults (they would be lost otherwise)
      const optionalFields: (keyof FormData)[] = [
        'courseTrue', 'courseMagnetic', 'speedOverGround', 'speedThroughWater',
        'windTrueDirection', 'windApparentDirection', 'windApparentSpeed', 'swellDirection',
        'cloudCoverOktas', 'temperature', 'engineHoursTotal',
        'fuelLevelL', 'waterLevelL', 'mooringStatus',
      ]
      optionalFields.forEach(field => {
        setValue(field, (existingEntry as any)[field])
      })
      setAttachments(existingEntry.attachments ?? [])
    }
  }, [isEdit, existingEntry, setValue])

  function copyFromLast() {
    const src = lastEntryForPassage
    if (!src) return
    reset({
      passageId: resolvedPassageId!,
      date: watch('date'),
      time: watch('time'),
      latitude: src.latitude,
      longitude: src.longitude,
      courseTrue: src.courseTrue,
      courseMagnetic: src.courseMagnetic,
      speedOverGround: src.speedOverGround,
      speedThroughWater: src.speedThroughWater,
      distanceSinceLastEntry: 0,
      windTrueDirection: src.windTrueDirection,
      windTrueSpeed: src.windTrueSpeed,
      windBeaufort: src.windBeaufort,
      windApparentDirection: src.windApparentDirection,
      windApparentSpeed: src.windApparentSpeed,
      seaStateBeaufort: src.seaStateBeaufort,
      swellHeightM: src.swellHeightM,
      swellDirection: src.swellDirection,
      baroPressureHPa: src.baroPressureHPa,
      pressureTrend: src.pressureTrend,
      visibility: src.visibility,
      cloudCoverOktas: src.cloudCoverOktas,
      weatherDescription: src.weatherDescription,
      temperature: src.temperature,
      engineOn: src.engineOn,
      engineHoursTotal: src.engineHoursTotal,
      fuelLevelL: (src.fuelLevelL ?? 0) <= 100 ? src.fuelLevelL : undefined,
      waterLevelL: (src.waterLevelL ?? 0) <= 100 ? src.waterLevelL : undefined,
      mainsailState: src.mainsailState ?? 'none',
      genoa: src.genoa ?? 'none',
      staysail: src.staysail ?? 'none',
      lightSail: src.lightSail ?? 'none',
      mooringStatus: src.mooringStatus,
      watchOfficer: src.watchOfficer,
      crewOnWatch: src.crewOnWatch ?? [],
      notes: '',
    })
  }

  function importFromNMEA(data: NMEAData) {
    if (data.latitude !== undefined && data.longitude !== undefined) {
      const lat = decimalToCoord(data.latitude, true)
      const lon = decimalToCoord(data.longitude, false)
      setValue('latitude', lat)
      setValue('longitude', lon)
      if (lastEntryForPassage) {
        const dist = haversineDistance(
          coordToDecimal(lastEntryForPassage.latitude),
          coordToDecimal(lastEntryForPassage.longitude),
          data.latitude,
          data.longitude,
        )
        setValue('distanceSinceLastEntry', parseFloat(dist.toFixed(1)))
      }
    }
    if (data.sog !== undefined) setValue('speedOverGround', parseFloat(data.sog.toFixed(1)))
    if (data.cogTrue !== undefined) setValue('courseTrue', Math.round(data.cogTrue) % 360)
    if (data.windTrueDirection !== undefined) setValue('windTrueDirection', Math.round(data.windTrueDirection) % 360)
    if (data.windTrueSpeed !== undefined) setValue('windTrueSpeed', parseFloat(data.windTrueSpeed.toFixed(1)))
    if (data.windApparentAngle !== undefined) setValue('windApparentDirection', Math.round(data.windApparentAngle) % 360)
    if (data.windApparentSpeed !== undefined) setValue('windApparentSpeed', parseFloat(data.windApparentSpeed.toFixed(1)))
    if (data.baroPressureHPa !== undefined) setValue('baroPressureHPa', parseFloat(data.baroPressureHPa.toFixed(0)))
    if (data.temperature !== undefined) setValue('temperature', parseFloat(data.temperature.toFixed(1)))
  }

  async function getGPSPosition() {
    if (!navigator.geolocation) {
      setGpsError(t('logEntry.gpsNotAvailable'))
      return
    }
    setGpsLoading(true)
    setGpsError('')
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 10000, maximumAge: 60000,
        })
      })
      const { latitude, longitude } = gpsToCoordinates(position)
      setValue('latitude', latitude)
      setValue('longitude', longitude)

      if (lastEntryForPassage) {
        const dist = haversineDistance(
          coordToDecimal(lastEntryForPassage.latitude),
          coordToDecimal(lastEntryForPassage.longitude),
          coordToDecimal(latitude),
          coordToDecimal(longitude),
        )
        setValue('distanceSinceLastEntry', parseFloat(dist.toFixed(1)))
      }
    } catch {
      setGpsError(t('errors.gpsError'))
    } finally {
      setGpsLoading(false)
    }
  }

  async function onSubmit(data: FormData) {
    setSaving(true)
    try {
      const now = new Date().toISOString()

      // Auto-compute pressure trend from barometric change vs last entry
      const lastBaro = lastEntryForPassage?.baroPressureHPa
      let pressureTrend: PressureTrend = 'steady'
      if (lastBaro !== undefined) {
        const diff = data.baroPressureHPa - lastBaro
        if (diff > 3)         pressureTrend = 'rising_rapidly'
        else if (diff > 0.5)  pressureTrend = 'rising'
        else if (diff < -3)   pressureTrend = 'falling_rapidly'
        else if (diff < -0.5) pressureTrend = 'falling'
      }

      const entryData: Omit<LogEntry, 'id'> = {
        ...data,
        pressureTrend,
        attachments,
        crewOnWatch: data.crewOnWatch ?? [],
        createdAt: now,
        updatedAt: now,
      }

      if (isEdit && id) {
        await db.logEntries.update(parseInt(id), { ...entryData, updatedAt: now })
      } else {
        await db.logEntries.add(entryData)
      }
      navigate('/ports')
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const visibilityOptions = [
    { value: 'excellent', label: t('logEntry.visibilities.excellent') },
    { value: 'good', label: t('logEntry.visibilities.good') },
    { value: 'moderate', label: t('logEntry.visibilities.moderate') },
    { value: 'poor', label: t('logEntry.visibilities.poor') },
    { value: 'fog', label: t('logEntry.visibilities.fog') },
  ]

  if (!resolvedPassageId) return null

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/ports')} className="btn-ghost flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          {t('common.back')}
        </button>
        <h1 className="text-xl font-bold">{isEdit ? t('logEntry.editEntry') : t('logEntry.newEntry')}</h1>
        <Button onClick={handleSubmit(onSubmit)} loading={saving} icon={<Save className="w-4 h-4" />}>
          {t('common.save')}
        </Button>
      </div>

      {/* Passage banner */}
      {passage && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
          <Anchor className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              {passage.departurePort} → {passage.arrivalPort}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {passage.departureDate} · {passage.departureCountry} → {passage.arrivalCountry}
            </p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            type="button"
            variant="secondary"
            icon={<Copy className="w-4 h-4" />}
            onClick={copyFromLast}
            disabled={!lastEntryForPassage}
            size="sm"
          >
            {t('logEntry.copyFromLast')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={gpsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            onClick={getGPSPosition}
            size="sm"
          >
            {t('logEntry.gpsAutoFill')}
          </Button>
          {settings?.nmeaEnabled && (
            <NMEAImportButton
              connected={nmeaConnected}
              data={nmeaData}
              onImport={importFromNMEA}
            />
          )}
          {gpsError && <span className="text-xs text-red-600 self-center">{gpsError}</span>}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Position & Time */}
        <Section title={t('logEntry.sections.position')} icon={<MapPin className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-4">
            <Input label={t('logEntry.date')} type="date" {...register('date')} required />
            <Input label={t('logEntry.time')} type="time" {...register('time')} required />
          </div>
          <Controller
            name="latitude"
            control={control}
            render={({ field }) => (
              <CoordinateInput
                label={nmLabel(t('logEntry.latitude'))}
                value={field.value as Coordinate}
                onChange={field.onChange}
                type="lat"
              />
            )}
          />
          <Controller
            name="longitude"
            control={control}
            render={({ field }) => (
              <CoordinateInput
                label={nmLabel(t('logEntry.longitude'))}
                value={field.value as Coordinate}
                onChange={field.onChange}
                type="lon"
              />
            )}
          />
        </Section>

        {/* Navigation */}
        <Section title={t('logEntry.sections.navigation')} icon={<Navigation className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-4">
            <Input label={nmLabel(t('logEntry.courseTrue'))} type="text" inputMode="numeric" {...register('courseTrue', { setValueAs: (v: string) => { const n = Math.round(parseFloat(String(v).replace(',', '.'))); return isNaN(n) ? undefined : n } })} />
            <Input label={t('logEntry.courseMagnetic')} type="text" inputMode="numeric" {...register('courseMagnetic', { setValueAs: (v: string) => { const n = Math.round(parseFloat(String(v).replace(',', '.'))); return isNaN(n) ? undefined : n } })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label={nmLabel(t('logEntry.sog'))} type="text" inputMode="decimal" {...register('speedOverGround', { setValueAs: (v: string) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? undefined : n } })} />
            <Input label={t('logEntry.stw')} type="text" inputMode="decimal" {...register('speedThroughWater', { setValueAs: (v: string) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? undefined : n } })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label={t('logEntry.distanceSinceLast')} type="text" inputMode="decimal" {...register('distanceSinceLastEntry', { setValueAs: (v: string) => parseFloat(String(v).replace(',', '.')) || 0 })} />
          </div>
        </Section>

        {/* Wind & Weather */}
        <Section title={t('logEntry.sections.wind')} icon={<Wind className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-4">
            <Input label={nmLabel(t('logEntry.windTrueDirection'))} type="text" inputMode="numeric" {...register('windTrueDirection', { setValueAs: (v: string) => { const n = Math.round(parseFloat(String(v).replace(',', '.'))); return isNaN(n) ? undefined : n } })} />
            <Input label={nmLabel(t('logEntry.windTrueSpeed'))} type="text" inputMode="decimal" {...register('windTrueSpeed', { setValueAs: (v: string) => parseFloat(String(v).replace(',', '.')) || 0 })} />
          </div>
          <BeaufortPicker
            label={t('logEntry.windBeaufort')}
            value={knotsToBeaufort(windTrueSpeed ?? 0)}
            onChange={() => {}}
            scale="beaufort"
            readOnly
          />
          <div className="grid grid-cols-2 gap-4">
            <Input label={nmLabel(t('logEntry.windApparentDir'))} type="text" inputMode="numeric" {...register('windApparentDirection', { setValueAs: (v: string) => { const n = Math.round(parseFloat(String(v).replace(',', '.'))); return isNaN(n) ? undefined : n } })} />
            <Input label={nmLabel(t('logEntry.windApparentSpeed'))} type="text" inputMode="decimal" {...register('windApparentSpeed', { setValueAs: (v: string) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? undefined : n } })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label={t('logEntry.swellHeight')} type="text" inputMode="decimal" {...register('swellHeightM', { setValueAs: (v: string) => parseFloat(String(v).replace(',', '.')) || 0 })} />
            <Input label={t('logEntry.swellDirection')} type="text" inputMode="numeric" {...register('swellDirection', { setValueAs: (v: string) => { const n = Math.round(parseFloat(String(v).replace(',', '.'))); return isNaN(n) ? undefined : n } })} />
          </div>
          <BeaufortPicker
            label={t('logEntry.seaState')}
            value={metersToSeaState(swellHeightM ?? 0)}
            onChange={() => {}}
            maxForce={9}
            scale="douglas"
            readOnly
          />
          <div className="grid grid-cols-2 gap-4">
            <Input label={nmLabel(t('logEntry.baroPressure'))} type="text" inputMode="decimal" {...register('baroPressureHPa', { setValueAs: (v: string) => parseFloat(String(v).replace(',', '.')) || 0 })} />
            <div>
              <p className="label">{t('logEntry.pressureTrend')}</p>
              <div className="mt-1 flex items-center h-9">
                <PressureTrendBadge current={baroPressureHPa ?? 1013} lastBaro={lastEntryForPassage?.baroPressureHPa} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Controller
              name="visibility"
              control={control}
              render={({ field }) => (
                <Select label={t('logEntry.visibility')} options={visibilityOptions} value={field.value} onChange={field.onChange} />
              )}
            />
            <Input label={nmLabel(t('logEntry.temperature'))} type="text" inputMode="decimal" {...register('temperature', { setValueAs: (v: string) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? undefined : n } })} />
          </div>
          <Controller
            name="cloudCoverOktas"
            control={control}
            render={({ field }) => (
              <OktasPicker label={t('logEntry.cloudCover')} value={field.value} onChange={field.onChange} />
            )}
          />
          <div>
            <label className="label">{t('logEntry.weatherDescription')}</label>
            <textarea {...register('weatherDescription')} rows={2} className="input resize-none" placeholder="Wolkenformation, Regenschauer, Sicht..." />
          </div>
        </Section>

        {/* Motor & Sails */}
        <Section title={t('logEntry.sections.engine')} icon={<Gauge className="w-4 h-4" />}>
          {/* Sail picker – first */}
          <div>
            <label className="label">{t('logEntry.sailConfig')}</label>
            <div className="mt-2 flex gap-4 items-start">
              <div className="flex-1 space-y-3 min-w-0">

                {/* Mainsail – 4 reef stages */}
                <SailRow label={t('logEntry.sails.mainsail')} color="blue">
                  <Controller name="mainsailState" control={control} render={({ field }) => (
                    <SailButtons value={field.value} onChange={(v) => {
                      field.onChange(v)
                      if (v !== 'none') setValue('mooringStatus', 'underway')
                    }} color="blue" options={[
                      { value: 'none',  label: '—' },
                      { value: 'full',  label: t('logEntry.sails.full') },
                      { value: 'reef1', label: 'R1' },
                      { value: 'reef2', label: 'R2' },
                      { value: 'reef3', label: 'R3' },
                      { value: 'reef4', label: 'R4' },
                    ]} />
                  )} />
                </SailRow>

                {/* Genoa – 3 reef stages */}
                <SailRow label={t('logEntry.sails.genoa')} color="blue">
                  <Controller name="genoa" control={control} render={({ field }) => (
                    <SailButtons value={field.value} onChange={(v) => {
                      field.onChange(v)
                      if (v !== 'none') setValue('mooringStatus', 'underway')
                    }} color="blue" options={[
                      { value: 'none',  label: '—' },
                      { value: 'full',  label: t('logEntry.sails.full') },
                      { value: 'reef1', label: 'R1' },
                      { value: 'reef2', label: 'R2' },
                      { value: 'reef3', label: 'R3' },
                    ]} />
                  )} />
                </SailRow>

                {/* Staysail – 3 reef stages */}
                <SailRow label={t('logEntry.sails.staysail')} color="blue">
                  <Controller name="staysail" control={control} render={({ field }) => (
                    <SailButtons value={field.value} onChange={(v) => {
                      field.onChange(v)
                      if (v !== 'none') setValue('mooringStatus', 'underway')
                    }} color="blue" options={[
                      { value: 'none',  label: '—' },
                      { value: 'full',  label: t('logEntry.sails.full') },
                      { value: 'reef1', label: 'R1' },
                      { value: 'reef2', label: 'R2' },
                      { value: 'reef3', label: 'R3' },
                    ]} />
                  )} />
                </SailRow>

                {/* Light sail */}
                <SailRow label={t('logEntry.sails.lightSail')} color="purple">
                  <Controller name="lightSail" control={control} render={({ field }) => (
                    <SailButtons value={field.value} onChange={(v) => {
                      field.onChange(v)
                      if (v !== 'none') setValue('mooringStatus', 'underway')
                    }} color="purple" options={[
                      { value: 'none',     label: '—' },
                      { value: 'code0',    label: 'Code 0' },
                      { value: 'gennaker', label: t('logEntry.sails.gennaker') },
                      { value: 'parasail', label: t('logEntry.sails.spinnaker') },
                    ]} />
                  )} />
                </SailRow>

              </div>
              {/* Live diagram */}
              <div className="flex-shrink-0 flex flex-col items-center gap-1 p-2 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <SailDiagram
                  mainsailState={mainsailState}
                  genoa={genoa}
                  staysail={staysail}
                  lightSail={lightSail}
                  size={76}
                />
                <p className="text-[9px] text-gray-400 leading-none">Heck ← → Bug</p>
              </div>
            </div>
          </div>
          {/* Engine – after sails */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 cursor-pointer mt-6">
              <input
                type="checkbox"
                {...register('engineOn', {
                  onChange: (e) => { if (e.target.checked) setValue('mooringStatus', 'underway') },
                })}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium">{t('logEntry.engineOn')}</span>
            </label>
            <Input label={t('logEntry.engineHoursTotal')} type="text" inputMode="decimal" {...register('engineHoursTotal', { setValueAs: (v: string) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? undefined : n } })} />
          </div>
          {/* Mooring status */}
          <div>
            <label className="label">{t('logEntry.mooringStatus')}</label>
            <Controller
              name="mooringStatus"
              control={control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-2 mt-1">
                  {MOORING_OPTIONS.map(opt => {
                    const Icon = opt.icon
                    const isActive = field.value === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          const newValue = isActive ? undefined : opt.value
                          field.onChange(newValue)
                          // Moored/anchored → furl all sails + engine off automatically
                          if (newValue && newValue !== 'underway') {
                            setValue('mainsailState', 'none')
                            setValue('genoa', 'none')
                            setValue('staysail', 'none')
                            setValue('lightSail', 'none')
                            setValue('engineOn', false)
                          }
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isActive
                            ? opt.colorActive
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {t(`logEntry.mooringStatuses.${opt.value}`)}
                      </button>
                    )
                  })}
                </div>
              )}
            />
          </div>
          {/* Fuel & Water level sliders */}
          {[
            { name: 'fuelLevelL' as const, label: t('logEntry.fuelLevel'), capacity: ship?.fuelCapacityL },
            { name: 'waterLevelL' as const, label: t('logEntry.waterLevel'), capacity: ship?.waterCapacityL },
          ].map(({ name, label, capacity }) => (
            <Controller
              key={name}
              name={name}
              control={control}
              render={({ field }) => (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label mb-0">{label}</label>
                    <div className="flex items-center gap-1.5">
                      {field.value !== undefined ? (
                        <>
                          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                            {field.value}%
                            {capacity ? ` · ≈${Math.round(field.value * capacity / 100)} L` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => field.onChange(undefined)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5 rounded"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => field.onChange(50)}
                          className="text-xs text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 px-2 py-0.5 rounded border border-dashed border-gray-300 dark:border-gray-600 transition-colors"
                        >
                          + erfassen
                        </button>
                      )}
                    </div>
                  </div>
                  {field.value !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 font-medium w-3">E</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={field.value}
                        onChange={e => field.onChange(Number(e.target.value))}
                        className="flex-1 accent-blue-600 h-2 cursor-pointer"
                      />
                      <span className="text-[10px] text-gray-400 font-medium w-3">F</span>
                    </div>
                  )}
                </div>
              )}
            />
          ))}
        </Section>

        {/* Crew */}
        <Section title={t('logEntry.sections.crew')} icon={<Users className="w-4 h-4" />}>
          {activeCrew && activeCrew.length > 0 && (
            <div>
              <label className="label">{t('logEntry.crewOnWatch')}</label>
              <div className="space-y-2">
                {activeCrew.map(member => {
                  const name = `${member.firstName} ${member.lastName}`
                  return (
                    <label key={member.id} className="flex items-center gap-2 cursor-pointer">
                      <Controller
                        name="crewOnWatch"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="checkbox"
                            checked={field.value?.includes(name) ?? false}
                            onChange={(e) => {
                              const current = field.value ?? []
                              if (e.target.checked) field.onChange([...current, name])
                              else field.onChange(current.filter((n: string) => n !== name))
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600"
                          />
                        )}
                      />
                      <span className="text-sm">{name}</span>
                      <span className="text-xs text-gray-500">({t(`crew.roles.${member.role}`)})</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </Section>

        {/* Notes & Attachments */}
        <Section title={t('logEntry.sections.notes')} icon={<FileText className="w-4 h-4" />}>
          <div>
            <label className="label">{t('common.notes')}</label>
            <textarea {...register('notes')} rows={4} className="input resize-none" placeholder="Besondere Vorkommnisse, Beobachtungen..." />
          </div>
          <FileUpload
            label={t('logEntry.attachments')}
            attachments={attachments}
            onUpload={(att) => setAttachments(prev => [...prev, att])}
            onRemove={(idx) => setAttachments(prev => prev.filter((_, i) => i !== idx))}
            disabled={!!import.meta.env.VITE_GH_PAGES}
            accept="image/*,application/pdf"
            multiple
          />
        </Section>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate('/ports')}>{t('common.cancel')}</Button>
          <Button type="submit" loading={saving} icon={<Save className="w-4 h-4" />}>{t('common.save')}</Button>
        </div>
      </form>
    </div>
  )
}
