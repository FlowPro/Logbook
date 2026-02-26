import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, Radio, Users, Anchor } from 'lucide-react'
import { db } from '../db/database'
import { formatCoordinate, gpsToCoordinates } from '../utils/geo'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import type { Coordinate } from '../db/models'

function formatUTCTime(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
}

export function Emergency() {
  const { t } = useTranslation()
  const [mobPosition, setMobPosition] = useState<{ lat: Coordinate; lon: Coordinate; time: string } | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())

  // Live clock (updates every second)
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const ship = useLiveQuery(() => db.ship.toCollection().first())
  const activeCrew = useLiveQuery(() => db.crew.filter(c => c.isActive).toArray())
  const lastEntry = useLiveQuery(() =>
    db.logEntries.orderBy('[date+time]').reverse().first()
  )

  async function saveMOBPosition() {
    setGpsLoading(true)
    try {
      if (navigator.geolocation) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 })
        )
        const { latitude, longitude } = gpsToCoordinates(pos)
        setMobPosition({ lat: latitude, lon: longitude, time: new Date().toUTCString() })
      } else if (lastEntry) {
        setMobPosition({ lat: lastEntry.latitude, lon: lastEntry.longitude, time: new Date().toUTCString() })
      }
    } catch {
      if (lastEntry) {
        setMobPosition({ lat: lastEntry.latitude, lon: lastEntry.longitude, time: new Date().toUTCString() })
      }
    } finally {
      setGpsLoading(false)
    }
  }

  // Best available position for MAYDAY
  const maydayPos = mobPosition
    ? `${formatCoordinate(mobPosition.lat)} ${formatCoordinate(mobPosition.lon)}`
    : lastEntry
      ? `${formatCoordinate(lastEntry.latitude)} ${formatCoordinate(lastEntry.longitude)}`
      : null

  const shipName = ship?.name ?? '[SCHIFFSNAME]'
  const callSign = ship?.callSign ?? '[RUFZEICHEN]'
  const mmsi = ship?.mmsi ?? '[MMSI]'
  const crewCount = activeCrew?.length ?? '?'

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* MOB Alert */}
      <div
        className="bg-red-600 text-white rounded-2xl p-6 text-center shadow-2xl cursor-pointer select-none active:scale-95 transition-transform"
        onClick={saveMOBPosition}
      >
        <AlertTriangle className="w-16 h-16 mx-auto mb-3 animate-pulse" />
        <div className="text-4xl font-black tracking-wider mb-2">MANN ÜBER BORD</div>
        <div className="text-xl font-bold tracking-wider mb-4">MAN OVERBOARD</div>
        <div className="text-lg opacity-90">⬆ TIPPEN zum Speichern der MOB-Position</div>
        {gpsLoading && <div className="mt-2 text-sm opacity-75">GPS wird abgerufen...</div>}
      </div>

      {/* MOB Position display */}
      {mobPosition && (
        <Card className="border-2 border-red-500">
          <div className="text-center">
            <div className="text-red-600 dark:text-red-400 font-bold text-lg mb-2">MOB POSITION GESPEICHERT</div>
            <div className="font-mono text-xl font-bold">
              {formatCoordinate(mobPosition.lat)} {formatCoordinate(mobPosition.lon)}
            </div>
            <div className="text-sm text-gray-500 mt-1">{mobPosition.time}</div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Sofort wenden – Motor starten – AIS MOB aktivieren
            </p>
          </div>
        </Card>
      )}

      {/* Ship info */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
            <Anchor className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="font-bold text-lg">{ship?.name ?? 'Schiff nicht eingetragen'}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">MMSI</div>
            <div className="font-mono font-bold text-lg">{ship?.mmsi ?? '—'}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Rufzeichen</div>
            <div className="font-mono font-bold text-lg">{ship?.callSign ?? '—'}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Flagge</div>
            <div className="font-bold">{ship?.flag ?? '—'}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Personen an Bord</div>
            <div className="font-bold text-xl">{activeCrew?.length ?? '—'}</div>
          </div>
        </div>

        {(mobPosition || lastEntry) && (
          <div className="mt-3 bg-blue-50 dark:bg-blue-950 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">
              {mobPosition ? 'MOB-Position' : 'Letzte bekannte Position'}
            </div>
            <div className="font-mono">{maydayPos}</div>
            {lastEntry && !mobPosition && (
              <div className="text-xs text-gray-500 mt-0.5">{lastEntry.date} {lastEntry.time} UTC</div>
            )}
          </div>
        )}
      </Card>

      {/* Distress channels + MAYDAY speech */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
            <Radio className="w-5 h-5 text-orange-600" />
          </div>
          <h2 className="font-bold text-lg">Notfunk</h2>
        </div>

        <div className="space-y-3">
          {/* Channel info */}
          <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950 rounded-lg">
            <div>
              <div className="font-bold text-red-700 dark:text-red-400">MAYDAY</div>
              <div className="text-sm text-red-600 dark:text-red-500">Kanal 16 DSC – Lebensgefahr</div>
            </div>
            <div className="font-mono font-bold text-2xl text-red-600">16</div>
          </div>
          <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
            <div>
              <div className="font-bold text-orange-700 dark:text-orange-400">PAN-PAN</div>
              <div className="text-sm text-orange-600 dark:text-orange-500">Kanal 16 – Dringlichkeit (keine Lebensgefahr)</div>
            </div>
            <div className="font-mono font-bold text-2xl text-orange-600">16</div>
          </div>

          {/* MAYDAY speech template – Wikipedia/SOLAS format (English – international maritime standard) */}
          <div className="p-4 bg-red-50 dark:bg-red-950/60 rounded-xl border border-red-300 dark:border-red-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-red-700 dark:text-red-400">MAYDAY Call (SOLAS / ITU)</span>
              <span className="text-xs font-mono text-gray-500">{formatUTCTime(currentTime)}</span>
            </div>
            <div className="font-mono text-sm space-y-1.5 text-gray-800 dark:text-gray-200">
              {/* Line 1 */}
              <p><span className="font-extrabold text-red-600 dark:text-red-400 text-base">MAYDAY MAYDAY MAYDAY</span></p>
              {/* Line 2 – Vessel identification */}
              <p>
                {'This is '}
                <span className="font-bold text-blue-700 dark:text-blue-300">{shipName}</span>
                {' '}<span className="font-bold text-blue-700 dark:text-blue-300">{shipName}</span>
                {' '}<span className="font-bold text-blue-700 dark:text-blue-300">{shipName}</span>
              </p>
              {/* Line 3 – Call sign and MMSI */}
              <p>
                {'Call Sign '}
                <span className="font-bold text-blue-700 dark:text-blue-300">{callSign}</span>
                {', MMSI '}
                <span className="font-bold text-blue-700 dark:text-blue-300">{mmsi}</span>
              </p>
              {/* Line 4 – Position */}
              <p>
                {'My position is '}
                {maydayPos
                  ? <span className="font-bold text-blue-700 dark:text-blue-300">{maydayPos}</span>
                  : <span className="italic text-orange-600">[position unknown – use GPS!]</span>
                }
              </p>
              {/* Line 5 – Nature of distress */}
              <p className="text-gray-500 dark:text-gray-400 italic">
                [<span className="not-italic text-orange-700 dark:text-orange-400">state nature of distress:</span>
                {' '}e.g. "We are sinking" · "Fire on board" · "Man overboard" · "Medical emergency"]
              </p>
              {/* Line 6 – Persons on board */}
              <p>
                <span className="font-bold text-blue-700 dark:text-blue-300">{crewCount}</span>
                {' persons on board'}
              </p>
              {/* Line 7 – Additional info */}
              <p className="text-gray-500 dark:text-gray-400 italic">
                [Vessel type: {ship?.type ?? 'sailing yacht'} · Colour: … · EPIRB: activated/—]
              </p>
              {/* Line 8 – Closing */}
              <p>
                <span className="font-extrabold text-red-600 dark:text-red-400">{'MAYDAY '}
                <span className="text-blue-700 dark:text-blue-300">{shipName}</span>
                {'. Over.'}
                </span>
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Repeat every 3–4 minutes until response. Activate EPIRB and SART.
            </p>
          </div>

          {/* PAN-PAN template */}
          <div className="p-4 bg-orange-50 dark:bg-orange-950/40 rounded-xl border border-orange-200 dark:border-orange-800">
            <div className="text-sm font-bold text-orange-700 dark:text-orange-400 mb-2">PAN-PAN Call (Urgency)</div>
            <div className="font-mono text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
              <p><span className="font-bold text-orange-600">PAN-PAN PAN-PAN PAN-PAN</span></p>
              <p>This is {shipName}, Call Sign {callSign}</p>
              <p>My position is {maydayPos ?? '[position]'}</p>
              <p>[Description of urgency situation]</p>
              <p>{crewCount} persons on board. Require [assistance / doctor / tug].</p>
              <p><span className="font-bold text-orange-600">PAN-PAN {shipName}.</span> Out.</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Emergency contacts */}
      {activeCrew && activeCrew.length > 0 && (
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="font-bold text-lg">Crew & Notfallkontakte</h2>
          </div>
          <div className="space-y-3">
            {activeCrew.map(m => (
              <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div>
                  <div className="font-medium">{m.firstName} {m.lastName}</div>
                  <div className="text-sm text-gray-500">{m.role === 'skipper' ? 'Skipper' : m.role === 'crew' ? 'Crew' : 'Passagier'}</div>
                  {m.emergencyContact && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      Notfall: {m.emergencyContact} · {m.emergencyPhone}
                    </div>
                  )}
                </div>
                {m.bloodType && (
                  <div className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-3 py-1 rounded-lg font-bold text-sm">
                    {m.bloodType}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
