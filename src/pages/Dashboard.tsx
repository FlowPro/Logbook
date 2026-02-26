import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import {
  PlusCircle,
  Navigation,
  Gauge,
  Anchor,
  Users,
  BookOpen,
  ArrowRight,
  Zap,
  Wind,
  Building2,
  CircleDot,
  GitCommitHorizontal,
} from 'lucide-react'
import type { MooringStatus } from '../db/models'
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

const MOORING_LABEL: Record<string, string> = {
  anchored:         'Anker',
  moored_marina:    'Hafen',
  moored_buoy:      'Boje',
  moored_alongside: 'Längs.',
}

const MOORING_STATUS_LABEL: Record<string, string> = {
  underway:         'Unterwegs',
  anchored:         'Vor Anker',
  moored_marina:    'Im Hafen',
  moored_buoy:      'An Boje',
  moored_alongside: 'Längsseits',
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

export function Dashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const lastEntry = useLiveQuery(() =>
    db.logEntries.orderBy('[date+time]').reverse().first()
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
    // each() uses an IndexedDB cursor – never loads all entries into RAM
    let sum = 0
    await db.logEntries.each(e => { sum += e.distanceSinceLastEntry ?? 0 })
    return sum
  })

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
          label={t('common.total') + ' Einträge'}
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
        <StatCard
          icon={<Anchor className="w-5 h-5" />}
          label={ship?.manufacturer && ship?.model ? `${ship.manufacturer} ${ship.model}` : 'Schiff'}
          value={ship?.name ?? 'Nicht eingetragen'}
          color="orange"
          small
        />
      </div>

      {/* Last entry + Quick stats */}
      <div className="grid md:grid-cols-2 gap-6">
        {lastEntry ? (
          <Card>
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
                <span className="text-sm text-gray-500">Liegestatus</span>
                <div className="flex items-center gap-1.5">
                  <MooringIcon status={lastEntry.mooringStatus} />
                  <span className="font-mono text-sm">
                    {MOORING_STATUS_LABEL[lastEntry.mooringStatus ?? 'underway'] ?? 'Unterwegs'}
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
          <Card>
            <div className="text-center py-8">
              <BookOpen className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 mb-4">{t('dashboard.noEntries')}</p>
              <Link to="/ports">
                <Button size="sm">{t('dashboard.startLogging')}</Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Crew on board */}
        <Card>
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
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 uppercase">
                  <th className="px-3 py-2 text-left">Datum / Zeit</th>
                  <th className="px-3 py-2 text-left hidden sm:table-cell">Position</th>
                  <th className="px-3 py-2 text-right hidden md:table-cell">Kurs</th>
                  <th className="px-3 py-2 text-right">SOG</th>
                  <th className="px-3 py-2 text-right">Bft</th>
                  <th className="px-3 py-2 text-right hidden md:table-cell">Oktas</th>
                  <th className="px-3 py-2 text-right hidden lg:table-cell">hPa</th>
                  <th className="px-3 py-2 text-center hidden md:table-cell">Antrieb / Status</th>
                  <th className="px-3 py-2 text-right hidden md:table-cell">nm</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {recentEntries.map(entry => (
                  <tr
                    key={entry.id}
                    onClick={() => navigate(`/log/${entry.id}`)}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {entry.date}<br />{entry.time} <span className="text-gray-400">UTC</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs hidden sm:table-cell whitespace-nowrap">
                      {formatCoordinate(entry.latitude)}<br />{formatCoordinate(entry.longitude)}
                    </td>
                    <td className="px-3 py-2 text-right hidden md:table-cell">
                      {entry.courseTrue != null ? `${entry.courseTrue}°` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {entry.speedOverGround != null ? entry.speedOverGround.toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Badge variant="beaufort" beaufortForce={entry.windBeaufort} />
                    </td>
                    <td className="px-3 py-2 text-right hidden md:table-cell">
                      <OktasBadge value={entry.cloudCoverOktas} />
                    </td>
                    <td className="px-3 py-2 text-right hidden lg:table-cell font-mono text-xs whitespace-nowrap">
                      {entry.baroPressureHPa ? (
                        <span>{trendIcon(entry.pressureTrend)} {entry.baroPressureHPa.toFixed(0)}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center hidden md:table-cell">
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
                    <td className="px-3 py-2 text-right hidden md:table-cell">
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
              Alle Einträge anzeigen <ArrowRight className="w-3 h-3" />
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
