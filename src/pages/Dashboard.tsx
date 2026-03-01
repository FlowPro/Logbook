import React, { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import {
  PlusCircle,
  Navigation,
  Anchor,
  Users,
  BookOpen,
  ArrowRight,
  Zap,
  Building2,
  CircleDot,
  GitCommitHorizontal,
  Wrench,
  AlertTriangle,
  Gauge,
  Fuel,
  Droplets,
  CheckCircle,
  Package,
  Clock,
  Route,
} from 'lucide-react'
import type { MooringStatus, MaintenanceEntry, StorageItem, LogEntry, Coordinate } from '../db/models'
import { SailDiagram } from '../components/ui/SailDiagram'
import { OktasBadge } from '../components/ui/OktasPicker'
import { db } from '../db/database'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { formatCoordinate } from '../utils/geo'
import { Button } from '../components/ui/Button'
import { fmtNum } from '../utils/units'
import { getCountryCode, getCountryName } from '../components/ui/CountrySelect'
import { getFlagUrl } from '../utils/flagUrl'
import { useSettings } from '../hooks/useSettings'

function trendIcon(trend?: string): string {
  switch (trend) {
    case 'rising_rapidly': return '↑↑'
    case 'rising': return '↑'
    case 'falling': return '↓'
    case 'falling_rapidly': return '↓↓'
    default: return '→'
  }
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

function getDueInfo(dueDate: string, today: string): { label: string; colorClass: string } {
  if (dueDate < today) {
    const days = Math.round((new Date(today).getTime() - new Date(dueDate).getTime()) / 86400000)
    return { label: `overdue:${days}`, colorClass: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }
  }
  if (dueDate === today) {
    return { label: 'today', colorClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' }
  }
  const days = Math.round((new Date(dueDate).getTime() - new Date(today).getTime()) / 86400000)
  return { label: `soon:${days}`, colorClass: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' }
}

export function Dashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { settings } = useSettings()

  // Mirror AppLayout dark-mode logic so the globe SVG always gets the right colors
  const [prefersDark, setPrefersDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setPrefersDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const themeMode = settings?.themeMode ?? (settings?.darkMode ? 'dark' : 'system')
  const isDark = themeMode === 'dark' || themeMode === 'night' || (themeMode === 'system' && prefersDark)

  const today = new Date().toISOString().slice(0, 10)
  const in14days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const lastEntry = useLiveQuery(() =>
    db.logEntries.orderBy('[date+time]').reverse().first()
  )
  const lastEntryPassage = useLiveQuery(
    () => lastEntry?.passageId ? db.passages.get(lastEntry.passageId) : undefined,
    [lastEntry?.passageId]
  )
  const lastEntryWithFuel = useLiveQuery(() =>
    db.logEntries.orderBy('[date+time]').reverse()
      .filter(e => e.fuelLevelL != null)
      .first()
  )
  const lastEntryWithWater = useLiveQuery(() =>
    db.logEntries.orderBy('[date+time]').reverse()
      .filter(e => e.waterLevelL != null)
      .first()
  )
  const recentEntries = useLiveQuery(() =>
    db.logEntries.orderBy('[date+time]').reverse().limit(5).toArray()
  )
  // All entries for the mini track SVG (chronological)
  const trackEntries = useLiveQuery(() =>
    db.logEntries.orderBy('[date+time]').toArray()
  )
  const ship = useLiveQuery(() => db.ship.toCollection().first())
  const activeCrew = useLiveQuery(() =>
    db.crew.filter(c => c.isActive).toArray()
  )
  const totalEntries   = useLiveQuery(() => db.logEntries.count())
  const totalPassages  = useLiveQuery(() => db.passages.count())

  const totalDistance = useLiveQuery(async () => {
    let sum = 0
    await db.logEntries.each(e => { sum += e.distanceSinceLastEntry ?? 0 })
    return sum
  })

  const alertsData = useLiveQuery(async () => {
    const cutoff = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    let maxEngineHours = 0
    await db.logEntries.each(e => { if ((e.engineHoursTotal ?? 0) > maxEngineHours) maxEngineHours = e.engineHoursTotal! })
    const tasks = await db.maintenance
      .filter((e: MaintenanceEntry) => {
        if (e.archivedAt || e.status === 'done') return false
        if (e.dueDate && e.dueDate <= cutoff) return true
        if (e.nextServiceDueHours != null && maxEngineHours > 0 && e.nextServiceDueHours <= maxEngineHours + 50) return true
        return false
      })
      .toArray()
    tasks.sort((a, b) => {
      // Overdue items first (date or engine hours), then by proximity
      const aDateOverdue = a.dueDate ? a.dueDate < cutoff.slice(0, 10) : false
      const bDateOverdue = b.dueDate ? b.dueDate < cutoff.slice(0, 10) : false
      if (aDateOverdue !== bDateOverdue) return aDateOverdue ? -1 : 1
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
      if (a.dueDate) return -1
      if (b.dueDate) return 1
      return (a.nextServiceDueHours ?? 0) - (b.nextServiceDueHours ?? 0)
    })
    return { tasks, maxEngineHours }
  }) ?? { tasks: [], maxEngineHours: 0 }

  const maintenanceAlerts = alertsData.tasks
  const currentEngineHours = alertsData.maxEngineHours

  const storageAlertItems = useLiveQuery(async () => {
    const today = new Date().toISOString().slice(0, 10)
    const soon  = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
    const items = await db.storageItems.toArray()
    const priority = (i: StorageItem): number => {
      if (i.expiryDate && i.expiryDate < today) return 0  // expired
      if (i.expiryDate && i.expiryDate <= soon) return 1  // expiring soon
      return 2                                             // low stock only
    }
    return items
      .filter(i =>
        (i.minQuantity != null && i.quantity < i.minQuantity) ||
        (i.expiryDate  != null && i.expiryDate <= soon)
      )
      .sort((a, b) => {
        const pa = priority(a), pb = priority(b)
        if (pa !== pb) return pa - pb
        // Within same priority: sort by expiryDate ascending (oldest/soonest first)
        if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate)
        return 0
      })
      .slice(0, 5)
  }) ?? []

  const storageAreaMap = useLiveQuery(async () => {
    const areas = await db.storageAreas.toArray()
    const m = new Map<number, string>()
    areas.forEach(a => { if (a.id != null) m.set(a.id, a.name) })
    return m
  }) ?? new Map<number, string>()

  function renderDueLabel(dueDate: string) {
    const { label, colorClass } = getDueInfo(dueDate, today)
    let text: string
    if (label === 'today') {
      text = t('dashboard.dueTodayLabel')
    } else if (label.startsWith('overdue:')) {
      text = t('dashboard.overdueDays', { count: Number(label.split(':')[1]) })
    } else {
      text = t('dashboard.dueDays', { count: Number(label.split(':')[1]) })
    }
    return (
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${colorClass}`}>
        {text}
      </span>
    )
  }

  function renderEngineHoursLabel(task: MaintenanceEntry) {
    if (task.nextServiceDueHours == null || currentEngineHours <= 0) return null
    const overdue = currentEngineHours >= task.nextServiceDueHours
    const colorClass = overdue
      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
    const text = overdue
      ? t('maintenance.engineHoursOverdue', { hours: Math.round(currentEngineHours - task.nextServiceDueHours) })
      : t('maintenance.engineHoursDue', { current: Math.round(currentEngineHours), due: task.nextServiceDueHours })
    return (
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${colorClass}`}>
        {text}
      </span>
    )
  }

  const overdueCount = maintenanceAlerts.filter(task =>
    (task.dueDate && task.dueDate < today) ||
    (task.nextServiceDueHours != null && currentEngineHours > 0 && currentEngineHours >= task.nextServiceDueHours)
  ).length

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
        <span className="text-base font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">
          {ship?.name ?? t('nav.dashboard')}
        </span>
        <span className="text-sm text-gray-400 dark:text-gray-500 hidden sm:inline flex-shrink-0">
          {format(new Date(), 'EEEE, dd. MMMM yyyy')}
        </span>
        <div className="flex-1" />
        <Link to="/ports">
          <Button icon={<PlusCircle className="w-4 h-4" />}>
            {t('logEntry.newEntry')}
          </Button>
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link to="/logbook" className="block">
          <StatCard
            icon={<BookOpen className="w-5 h-5" />}
            label={t('dashboard.totalEntries')}
            value={String(totalEntries ?? 0)}
            color="blue"
            clickable
          />
        </Link>
        <Link to="/ports" className="block">
          <StatCard
            icon={<Route className="w-5 h-5" />}
            label={t('dashboard.totalPassages')}
            value={String(totalPassages ?? 0)}
            color="purple"
            clickable
          />
        </Link>
        <StatCard
          icon={<Navigation className="w-5 h-5" />}
          label={t('dashboard.totalDistance')}
          value={`${fmtNum(totalDistance ?? 0)} nm`}
          color="green"
        />
        <Link to="/settings#ship" className="block">
          <div className="card p-4 hover:shadow-md transition-shadow">
            <div className="inline-flex p-2 rounded-lg mb-3 bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400">
              <Anchor className="w-5 h-5" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate flex items-center gap-2">
              {ship?.name ?? '—'}
              {ship?.flag && <img src={getFlagUrl(ship.flag)} alt={ship.flag} className="w-6 h-4 object-cover rounded-sm flex-shrink-0" />}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {ship?.manufacturer && ship?.model ? `${ship.manufacturer} ${ship.model}` : t('nav.ship')}
            </div>
          </div>
        </Link>
      </div>

      {/* Main content: 3-row × 3-col grid
            Row 1 (auto):  Maintenance (col 1-2)  |  Bordstatus (col 3)
            Row 2 (auto):  Storage     (col 1-2)  |  Crew       (col 3)
            Row 3 (1fr):   Last Entry  (col 1-2)  |  Mini Track (col 3)  */}
      <div className="grid md:grid-cols-3 gap-6">

        {/* ── Row 1, left (col 1-2): Maintenance alerts ── */}
        <div className="md:col-span-2 md:row-start-1">
          <Card className="h-full">
            <CardHeader
              title={t('dashboard.maintenanceAlerts')}
              icon={overdueCount > 0
                ? <AlertTriangle className="w-4 h-4 text-red-500" />
                : <Wrench className="w-4 h-4" />
              }
              action={
                <Link to="/maintenance" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                  {t('nav.maintenance')} <ArrowRight className="w-3 h-3" />
                </Link>
              }
            />
            {maintenanceAlerts.length > 0 ? (
              <>
                <ul className="space-y-2">
                  {maintenanceAlerts.slice(0, 5).map(task => (
                    <li
                      key={task.id}
                      onClick={() => navigate('/maintenance', { state: { editId: task.id } })}
                      className="flex items-center gap-3 py-1.5 border-b last:border-0 border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -mx-1 px-1 rounded transition-colors"
                    >
                      <Wrench className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="flex-1 text-sm font-medium truncate">
                        {task.description || t('maintenance.noTitle')}
                      </span>
                      <span className="text-xs text-gray-400 hidden sm:inline">
                        {t(`maintenance.categories.${task.category}`)}
                      </span>
                      {task.dueDate
                        ? renderDueLabel(task.dueDate)
                        : renderEngineHoursLabel(task)}
                    </li>
                  ))}
                </ul>
                {maintenanceAlerts.length > 5 && (
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    +{maintenanceAlerts.length - 5} {t('nav.maintenance').toLowerCase()}
                  </p>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle className="w-8 h-8 text-green-500 mb-2" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('dashboard.noMaintenanceAlerts')}</p>
                <Link to="/maintenance" className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1.5 inline-flex items-center gap-1">
                  {t('nav.maintenance')} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </Card>
        </div>

        {/* ── Row 1, right (col 3): Bordstatus ── */}
        <div className="md:col-start-3 md:row-start-1">
          <Card className="h-full">
            <CardHeader
              title={t('dashboard.vesselStatus')}
              icon={<Gauge className="w-4 h-4" />}
            />
            {currentEngineHours === 0 && lastEntryWithFuel == null && lastEntryWithWater == null ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Gauge className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-500">{t('dashboard.vesselStatusEmpty')}</p>
                <Link to="/ports" className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1.5 inline-flex items-center gap-1">
                  {t('logEntry.newEntry')} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm text-gray-500">
                    <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                    {t('dashboard.engineHours')}
                  </span>
                  <span className="font-mono text-sm font-semibold">
                    {currentEngineHours > 0 ? `${fmtNum(currentEngineHours, 1)} h` : '—'}
                  </span>
                </div>
                <TankRow
                  icon={<Fuel className="w-3.5 h-3.5 flex-shrink-0" />}
                  label={t('logEntry.fuelLevel')}
                  pct={lastEntryWithFuel?.fuelLevelL ?? null}
                  capacity={ship?.fuelCapacityL}
                />
                <TankRow
                  icon={<Droplets className="w-3.5 h-3.5 flex-shrink-0" />}
                  label={t('logEntry.waterLevel')}
                  pct={lastEntryWithWater?.waterLevelL ?? null}
                  capacity={ship?.waterCapacityL}
                />
              </div>
            )}
          </Card>
        </div>

        {/* ── Row 2, left (col 1-2): Storage alerts ── */}
        <div className="md:col-span-2 md:row-start-2">
          <Card className="h-full">
            <CardHeader
              title={t('dashboard.storageAlerts')}
              icon={storageAlertItems.length > 0
                ? <AlertTriangle className="w-4 h-4 text-red-500" />
                : <Package className="w-4 h-4" />
              }
              action={
                <Link to="/storage" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                  {t('nav.storage')} <ArrowRight className="w-3 h-3" />
                </Link>
              }
            />
            {storageAlertItems.length > 0 ? (
              <ul className="space-y-2">
                {storageAlertItems.map((item: StorageItem) => {
                  const todayStr = new Date().toISOString().slice(0, 10)
                  const expired  = item.expiryDate != null && item.expiryDate < todayStr
                  const lowStock = item.minQuantity != null && item.quantity < item.minQuantity
                  const colorClass = (expired || lowStock)
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  return (
                    <li
                      key={item.id}
                      onClick={() => navigate('/storage', { state: { editItemId: item.id } })}
                      className="flex items-center gap-3 py-1.5 border-b last:border-0 border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -mx-1 px-1 rounded transition-colors"
                    >
                      {lowStock
                        ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        : <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      }
                      <span className="flex-1 text-sm font-medium truncate">{item.name}</span>
                      <span className="text-xs text-gray-400 hidden sm:inline">
                        {storageAreaMap?.get(item.areaId) ?? ''}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap ${colorClass}`}>
                        {lowStock
                          ? `${item.quantity} / ${item.minQuantity} ${item.unit}`
                          : item.expiryDate}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle className="w-8 h-8 text-green-500 mb-2" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('dashboard.noStorageAlerts')}</p>
                <Link to="/storage" className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1.5 inline-flex items-center gap-1">
                  {t('nav.storage')} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </Card>
        </div>

        {/* ── Row 2, right (col 3): Crew ── */}
        <div className="md:col-start-3 md:row-start-2">
          <Card className="h-full">
            <CardHeader
              title={t('dashboard.crewOnBoard')}
              icon={<Users className="w-4 h-4" />}
              action={
                <Link to="/crew" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                  {t('nav.crew')} <ArrowRight className="w-3 h-3" />
                </Link>
              }
            />
            {activeCrew && activeCrew.length > 0 ? (
              <ul className="space-y-2">
                {activeCrew.map(m => (
                  <li key={m.id} onClick={() => navigate('/crew', { state: { editMemberId: m.id } })} className="flex items-center justify-between py-1.5 border-b last:border-0 border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -mx-1 px-1 rounded transition-colors">
                    <div>
                      <span className="font-medium text-sm">{m.firstName} {m.lastName}</span>
                      {m.nationality && (() => {
                        const code = getCountryCode(m.nationality)
                        return code ? <img src={getFlagUrl(code)} alt={code} className="w-4 h-3 object-cover rounded-sm flex-shrink-0 ml-2 inline-block align-middle" /> : null
                      })()}
                    </div>
                    <Badge variant={m.role === 'skipper' ? 'info' : 'default'}>
                      {t(`crew.roles.${m.role}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-6">
                <Users className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">{t('crew.noCrewMembers')}</p>
                <Link to="/crew" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
                  {t('crew.addMember')}
                </Link>
              </div>
            )}
          </Card>
        </div>

        {/* ── Row 3, left (col 1-2): Last log entry ── */}
        <div className="md:col-span-2 md:row-start-3">
          {lastEntry ? (
            <Card className="h-full">
              <CardHeader
                title={t('dashboard.lastEntry')}
                icon={<BookOpen className="w-4 h-4" />}
                action={
                  <Link to="/logbook" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                    {t('nav.logbook')} <ArrowRight className="w-3 h-3" />
                  </Link>
                }
              />
              <div className="space-y-3">
                {lastEntryPassage && (
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-700">
                    <span className="text-sm text-gray-500">{t('dashboard.activePassage')}</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                      <span>{lastEntryPassage.departurePort}</span>
                      {(() => { const c = getCountryCode(lastEntryPassage.departureCountry); return c ? <img src={getFlagUrl(c)} alt={c} className="w-5 h-3.5 object-cover rounded-sm flex-shrink-0" /> : null })()}
                      <span className="text-gray-400 font-normal">→</span>
                      <span>{lastEntryPassage.arrivalPort || '…'}</span>
                      {lastEntryPassage.arrivalCountry && (() => { const c = getCountryCode(lastEntryPassage.arrivalCountry); return c ? <img src={getFlagUrl(c)} alt={c} className="w-5 h-3.5 object-cover rounded-sm flex-shrink-0" /> : null })()}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{t('logEntry.date')}</span>
                  <span className="font-mono text-sm font-medium">
                    {lastEntry.date} {lastEntry.time} UTC
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{t('logEntry.sections.position')}</span>
                  <span className="font-mono text-sm">
                    {formatCoordinate(lastEntry.latitude)} {formatCoordinate(lastEntry.longitude)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{t('logEntry.sog')}</span>
                  <span className="font-mono text-sm font-medium">{lastEntry.speedOverGround != null ? `${lastEntry.speedOverGround.toFixed(1)} kn` : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{t('logEntry.distanceSinceLast')}</span>
                  <span className="font-mono text-sm">{lastEntry.distanceSinceLastEntry.toFixed(1)} nm</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{t('logEntry.windBeaufort')}</span>
                  <Badge variant="beaufort" beaufortForce={lastEntry.windBeaufort} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{t('logEntry.baroPressure')}</span>
                  <span className="font-mono text-sm">{lastEntry.baroPressureHPa} hPa</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{t('logEntry.mooringStatus')}</span>
                  <div className="flex items-center gap-1.5">
                    <MooringIcon status={lastEntry.mooringStatus} />
                    <span className="font-mono text-sm">
                      {t(`logEntry.mooringStatuses.${lastEntry.mooringStatus ?? 'underway'}`)}
                    </span>
                  </div>
                </div>
                {lastEntry.notes && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 italic border-t pt-2 mt-2 border-gray-100 dark:border-gray-700">
                    "{lastEntry.notes}"
                  </p>
                )}
              </div>
            </Card>
          ) : (
            <Card className="h-full">
              <div className="text-center py-8">
                <BookOpen className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 mb-4">{t('dashboard.noEntries')}</p>
                <Link to="/ports">
                  <Button size="sm">{t('dashboard.startLogging')}</Button>
                </Link>
              </div>
            </Card>
          )}
        </div>

        {/* ── Row 3, right (col 3): Mini voyage track SVG ── */}
        <div className="md:col-start-3 md:row-start-3">
          <MiniTrackWidget entries={trackEntries ?? []} navigate={navigate} t={t} isDark={isDark} />
        </div>

      </div>

      {/* Recent entries list */}
      {recentEntries && recentEntries.length > 0 && (
        <Card padding={false}>
          <div className="px-4 md:px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="section-title">
              <BookOpen className="w-4 h-4" />
              {t('dashboard.recentEntries')}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide">{t('dashboard.dateTime')}</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide max-sm:hidden">{t('logEntry.sections.position')}</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide max-md:hidden">{t('dashboard.course')}</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide">{t('logEntry.sog')}</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide">Bft</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide max-md:hidden">Oktas</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide max-lg:hidden">hPa</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide max-md:hidden">{t('dashboard.propulsion')}</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-700 dark:text-gray-300 uppercase font-semibold tracking-wide max-md:hidden">nm</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {recentEntries.map(entry => (
                  <tr
                    key={entry.id}
                    onClick={() => navigate(`/log/${entry.id}`)}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-mono text-xs"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {entry.date}<br />{entry.time} <span className="text-gray-400">UTC</span>
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
                              {t(`logEntry.mooringStatuses.${entry.mooringStatus}`)}
                            </span>
                          </div>
                        ) : (
                          <>
                            {entry.engineOn && (
                              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 leading-none">
                                <Zap className="w-2.5 h-2.5" />{t('maintenance.categories.engine')}
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
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 md:px-6 py-3 border-t border-gray-100 dark:border-gray-700">
            <Link to="/logbook" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              {t('dashboard.showAllEntries')} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Helpers for MiniTrackWidget (Globe) ───────────────────────────────────────

function coordToDecimal(c: Coordinate): number {
  const d = c.degrees + c.minutes / 60
  return c.direction === 'S' || c.direction === 'W' ? -d : d
}

interface MiniTrackProps {
  entries: LogEntry[]
  navigate: (path: string) => void
  t: (key: string) => string
  isDark: boolean
}

function MiniTrackWidget({ entries, navigate, t, isDark }: MiniTrackProps) {
  const valid = useMemo(() =>
    entries.filter(e => e.latitude?.degrees != null && e.longitude?.degrees != null),
    [entries]
  )

  const emptyState = (
    <div className="h-full cursor-pointer" onClick={() => navigate('/map')}>
      <Card className="h-full hover:shadow-md transition-shadow">
        <CardHeader
          title={t('nav.map')}
          icon={<Navigation className="w-4 h-4" />}
          action={
            <Link to="/map" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              onClick={e => e.stopPropagation()}>
              {t('nav.map')} <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Navigation className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm text-gray-500">{t('map.noData')}</p>
        </div>
      </Card>
    </div>
  )
  if (valid.length < 2) return emptyState

  const toRad = (d: number) => d * Math.PI / 180

  // Convert coordinates to radians
  const pts = valid.map(e => ({
    latR: toRad(coordToDecimal(e.latitude)),
    lonR: toRad(coordToDecimal(e.longitude)),
    passageId: e.passageId,
  }))

  // Globe center = centroid of all points
  const lat0 = pts.reduce((s, p) => s + p.latR, 0) / pts.length
  const lon0 = pts.reduce((s, p) => s + p.lonR, 0) / pts.length
  const sinLat0 = Math.sin(lat0), cosLat0 = Math.cos(lat0)

  const R = 80, CX = 100, CY = 100

  // Orthographic projection — returns [x, y, visible]
  const project = (latR: number, lonR: number): [number, number, boolean] => {
    const dLon = lonR - lon0
    const sinLat = Math.sin(latR), cosLat = Math.cos(latR)
    const dot = sinLat0 * sinLat + cosLat0 * cosLat * Math.cos(dLon)
    const x = CX + R * cosLat * Math.sin(dLon)
    const y = CY - R * (cosLat0 * sinLat - sinLat0 * cosLat * Math.cos(dLon))
    return [x, y, dot >= 0]
  }

  // Build grid polylines, splitting at the horizon (invisible → visible transitions)
  const buildPolylines = (pointGetter: (i: number) => [number, number, boolean], steps: number) => {
    const result: string[] = []
    let seg: string[] = []
    for (let i = 0; i <= steps; i++) {
      const [x, y, vis] = pointGetter(i)
      if (vis) {
        seg.push(`${x.toFixed(1)},${y.toFixed(1)}`)
      } else {
        if (seg.length > 1) result.push(seg.join(' '))
        seg = []
      }
    }
    if (seg.length > 1) result.push(seg.join(' '))
    return result
  }

  const gridPolylines: string[] = []
  // Parallels: every 30°
  for (const latDeg of [-60, -30, 0, 30, 60]) {
    buildPolylines(i => project(toRad(latDeg), toRad(-180 + i * 3)), 120)
      .forEach(p => gridPolylines.push(p))
  }
  // Meridians: every 30°
  for (let lonDeg = -180; lonDeg < 180; lonDeg += 30) {
    buildPolylines(i => project(toRad(-90 + i * 1.5), toRad(lonDeg)), 120)
      .forEach(p => gridPolylines.push(p))
  }

  // Route polylines — grouped by passage, split at the horizon
  const passageMap = new Map<number, typeof pts>()
  pts.forEach(p => {
    if (!passageMap.has(p.passageId)) passageMap.set(p.passageId, [])
    passageMap.get(p.passageId)!.push(p)
  })
  const routePolylines: string[] = []
  passageMap.forEach(ppts => {
    let seg: string[] = []
    ppts.forEach(p => {
      const [x, y, vis] = project(p.latR, p.lonR)
      if (vis) {
        seg.push(`${x.toFixed(1)},${y.toFixed(1)}`)
      } else {
        if (seg.length > 1) routePolylines.push(seg.join(' '))
        seg = []
      }
    })
    if (seg.length > 1) routePolylines.push(seg.join(' '))
  })

  // Visible dots
  const dots = pts.map((p, i) => {
    const [x, y, vis] = project(p.latR, p.lonR)
    return vis ? { x, y, key: i } : null
  }).filter((d): d is { x: number; y: number; key: number } => d !== null)

  const last = pts[pts.length - 1]
  const [lastX, lastY, lastVis] = project(last.latR, last.lonR)

  const c = isDark
    ? { inner: '#1a3a5c', outer: '#060f1e', grid: '#3b82f6', gridOp: 0.3, route: '#60a5fa', dot: '#93c5fd', last: '#10b981', rim: '#334155', text: '#6b7280' }
    : { inner: '#4a90d9', outer: '#1a3a6b', grid: '#bfdbfe', gridOp: 0.5, route: '#ffffff', dot: '#dbeafe', last: '#10b981', rim: '#2563eb', text: '#6b7280' }

  return (
    <div className="h-full cursor-pointer" onClick={() => navigate('/map')}>
      <Card className="h-full hover:shadow-md transition-shadow">
        <CardHeader
          title={t('nav.map')}
          icon={<Navigation className="w-4 h-4" />}
          action={
            <Link to="/map" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              onClick={e => e.stopPropagation()}>
              {t('nav.map')} <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />
        <svg viewBox="0 0 200 210" className="w-full max-h-72 mx-auto block">
          <defs>
            <radialGradient id="globe-ocean" cx="35%" cy="28%" r="72%">
              <stop offset="0%" stopColor={c.inner} />
              <stop offset="100%" stopColor={c.outer} />
            </radialGradient>
            <radialGradient id="globe-sheen" cx="32%" cy="28%" r="60%">
              <stop offset="0%" stopColor="white" stopOpacity={isDark ? 0.06 : 0.18} />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="globe-shadow" cx="50%" cy="50%" r="50%">
              <stop offset="80%" stopColor="transparent" />
              <stop offset="100%" stopColor={isDark ? 'rgba(0,0,0,0.55)' : 'rgba(10,30,80,0.35)'} />
            </radialGradient>
            <clipPath id="globe-clip">
              <circle cx={CX} cy={CY} r={R} />
            </clipPath>
          </defs>

          {/* Globe base */}
          <circle cx={CX} cy={CY} r={R} fill="url(#globe-ocean)" />

          <g clipPath="url(#globe-clip)">
            {/* Lat/lon grid */}
            {gridPolylines.map((poly, i) => (
              <polyline key={i} points={poly} fill="none"
                stroke={c.grid} strokeWidth={0.6} opacity={c.gridOp} />
            ))}

            {/* Equator slightly bolder */}
            {buildPolylines(i => project(0, toRad(-180 + i * 3)), 120).map((poly, i) => (
              <polyline key={`eq${i}`} points={poly} fill="none"
                stroke={c.grid} strokeWidth={1.0} opacity={c.gridOp * 1.5} />
            ))}

            {/* Route */}
            {routePolylines.map((poly, i) => (
              <polyline key={`r${i}`} points={poly} fill="none"
                stroke={c.route} strokeWidth={2.5}
                strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
            ))}

            {/* Entry dots */}
            {dots.map(d => (
              <circle key={d.key} cx={d.x} cy={d.y} r={1.8} fill={c.dot} opacity={0.85} />
            ))}

            {/* Last position */}
            {lastVis && (
              <circle cx={lastX} cy={lastY} r={5.5} fill={c.last} stroke="white" strokeWidth={1.5} />
            )}

            {/* Specular sheen for 3-D look */}
            <circle cx={CX} cy={CY} r={R} fill="url(#globe-sheen)" />
          </g>

          {/* Rim shadow + outline */}
          <circle cx={CX} cy={CY} r={R} fill="url(#globe-shadow)" />
          <circle cx={CX} cy={CY} r={R} fill="none" stroke={c.rim} strokeWidth={1.5} />

          {/* N marker */}
          <text x={CX} y={CY - R - 5} textAnchor="middle" fill={c.text} fontSize={9} fontWeight="bold">N</text>

          {/* Point count */}
          <text x={CX} y={CY + R + 14} textAnchor="middle" fill={c.text} fontSize={9}>{valid.length} pts</text>
        </svg>
      </Card>
    </div>
  )
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  color: 'blue' | 'green' | 'purple' | 'orange'
  small?: boolean
  clickable?: boolean
}

interface TankRowProps {
  icon: React.ReactNode
  label: string
  pct: number | null | undefined  // 0–100 as stored in LogEntry
  capacity?: number               // litres from ship profile
}

function TankRow({ icon, label, pct, capacity }: TankRowProps) {
  if (pct == null) {
    return (
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm text-gray-500">
          {icon}
          {label}
        </span>
        <span className="font-mono text-sm font-semibold text-gray-300 dark:text-gray-600">—</span>
      </div>
    )
  }
  const litres = capacity && capacity > 0 ? Math.round(pct / 100 * capacity) : null
  const barColor = pct <= 20 ? 'bg-red-500' : pct <= 40 ? 'bg-orange-400' : 'bg-green-500'
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1.5 text-sm text-gray-500">
          {icon}
          {label}
        </span>
        <span className="font-mono text-sm font-semibold">
          {litres != null
            ? `${litres} L / ${Math.round(capacity!)} L`
            : `${Math.round(pct)} %`}
        </span>
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color, small, clickable }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400',
    purple: 'bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400',
  }[color]

  return (
    <div className={`card p-4 ${clickable ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}>
      <div className={`inline-flex p-2 rounded-lg mb-3 ${colorClasses}`}>
        {icon}
      </div>
      <div className={`font-bold ${small ? 'text-sm' : 'text-2xl'} text-gray-900 dark:text-gray-100 truncate`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}
