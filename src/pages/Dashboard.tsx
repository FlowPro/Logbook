import React from 'react'
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
} from 'lucide-react'
import type { MooringStatus, MaintenanceEntry } from '../db/models'
import { SailDiagram } from '../components/ui/SailDiagram'
import { OktasBadge } from '../components/ui/OktasPicker'
import { db } from '../db/database'
import { Card, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { formatCoordinate } from '../utils/geo'
import { Button } from '../components/ui/Button'
import { fmtNum } from '../utils/units'

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

  const today = new Date().toISOString().slice(0, 10)
  const in14days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const lastEntry = useLiveQuery(() =>
    db.logEntries.orderBy('[date+time]').reverse().first()
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
  const ship = useLiveQuery(() => db.ship.toCollection().first())
  const activeCrew = useLiveQuery(() =>
    db.crew.filter(c => c.isActive).toArray()
  )
  const totalEntries = useLiveQuery(() => db.logEntries.count())

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
      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {ship?.name ?? t('nav.dashboard')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            {format(new Date(), 'EEEE, dd. MMMM yyyy')}
          </p>
        </div>
        <Link to="/ports">
          <Button icon={<PlusCircle className="w-4 h-4" />}>
            {t('logEntry.newEntry')}
          </Button>
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<BookOpen className="w-5 h-5" />}
          label={t('dashboard.totalEntries')}
          value={String(totalEntries ?? 0)}
          color="blue"
        />
        <StatCard
          icon={<Navigation className="w-5 h-5" />}
          label={t('dashboard.totalDistance')}
          value={`${fmtNum(totalDistance ?? 0)} nm`}
          color="green"
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label={t('dashboard.crewOnBoard')}
          value={String(activeCrew?.length ?? 0)}
          color="purple"
        />
        <Link to="/settings#ship" className="block">
          <div className="card p-4 hover:shadow-md transition-shadow">
            <div className="inline-flex p-2 rounded-lg mb-3 bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400">
              <Anchor className="w-5 h-5" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
              {ship?.name ?? '—'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {ship?.manufacturer && ship?.model ? `${ship.manufacturer} ${ship.model}` : t('nav.ship')}
            </div>
          </div>
        </Link>
      </div>

      {/* Main content: 2-row × 3-col grid
            Row 1 (auto):  Maintenance (col 1-2)  |  Bordstatus (col 3)
            Row 2 (1fr):   Last Entry  (col 1-2)  |  Crew       (col 3)
          Cards in the same row are forced to equal height via CSS grid stretch + h-full. */}
      <div className="grid md:grid-cols-3 md:grid-rows-[auto_1fr] gap-6">

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

        {/* ── Row 2, left (col 1-2): Last log entry ── */}
        <div className="md:col-span-2 md:row-start-2">
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
                  <li key={m.id} className="flex items-center justify-between py-1.5 border-b last:border-0 border-gray-100 dark:border-gray-700">
                    <div>
                      <span className="font-medium text-sm">{m.firstName} {m.lastName}</span>
                      <span className="text-xs text-gray-500 ml-2">{m.nationality}</span>
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

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  color: 'blue' | 'green' | 'purple' | 'orange'
  small?: boolean
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

function StatCard({ icon, label, value, color, small }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400',
    purple: 'bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400',
  }[color]

  return (
    <div className="card p-4">
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
