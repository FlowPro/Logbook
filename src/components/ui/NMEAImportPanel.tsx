import { useTranslation } from 'react-i18next'
import { Wifi, WifiOff } from 'lucide-react'
import type { NMEAData } from '../../hooks/useNMEA'
import { Button } from './Button'

interface NMEAImportButtonProps {
  connected: boolean
  data: NMEAData
  onImport: (data: NMEAData) => void
}

/** Custom NMEA icon: signal arcs + dot + downward arrow — conveys "receive from NMEA device" */
function NMEAIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Inner arc */}
      <path d="M5.8 6.2a3 3 0 014.4 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {/* Outer arc */}
      <path d="M3.5 4a6 6 0 019 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {/* Centre dot (antenna tip) */}
      <circle cx="8" cy="7.5" r="0.9" fill="currentColor" />
      {/* Vertical stem */}
      <line x1="8" y1="8.4" x2="8" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {/* Downward arrow head */}
      <polyline points="5.8,10.2 8,12.5 10.2,10.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Compact "Import NMEA" button — drop-in alongside GPS / copy buttons */
export function NMEAImportButton({ connected, data, onImport }: NMEAImportButtonProps) {
  const { t } = useTranslation()
  const hasAny = data.latitude !== undefined || data.sog !== undefined ||
    data.windTrueSpeed !== undefined || data.baroPressureHPa !== undefined ||
    data.temperature !== undefined

  const iconColor = connected && hasAny
    ? 'text-green-500'
    : 'text-red-400'

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      icon={<NMEAIcon className={`w-4 h-4 ${iconColor}`} />}
      onClick={() => onImport(data)}
      disabled={!connected || !hasAny}
    >
      {t('nmea.import')}
    </Button>
  )
}

/** Small inline status chip showing NMEA connection + live data preview */
export function NMEAStatusLine({ connected, data }: { connected: boolean; data: NMEAData }) {
  const { t } = useTranslation()
  if (connected) {
    const parts: string[] = []
    if (data.latitude !== undefined && data.longitude !== undefined)
      parts.push(`${data.latitude.toFixed(4)}° / ${data.longitude.toFixed(4)}°`)
    if (data.sog !== undefined) parts.push(`SOG ${data.sog.toFixed(1)} kn`)
    if (data.windTrueSpeed !== undefined) parts.push(`Wind ${data.windTrueSpeed.toFixed(0)} kn`)
    if (data.baroPressureHPa !== undefined) parts.push(`${data.baroPressureHPa.toFixed(0)} hPa`)
    if (data.temperature !== undefined) parts.push(`${data.temperature.toFixed(1)} °C`)

    return (
      <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
        <Wifi className="w-3 h-3 flex-shrink-0" />
        <span className="truncate">{parts.length ? parts.join(' · ') : t('nmea.waitingData')}</span>
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-400">
      <WifiOff className="w-3 h-3 flex-shrink-0" />
      {t('nmea.notConnected')}
    </span>
  )
}

/** @deprecated Use NMEAImportButton + NMEAStatusLine */
export function NMEAImportPanel({ connected, data, onImport }: NMEAImportButtonProps) {
  const { t } = useTranslation()
  if (!connected) return null
  const hasAny = data.latitude !== undefined || data.sog !== undefined ||
    data.windTrueSpeed !== undefined || data.baroPressureHPa !== undefined ||
    data.temperature !== undefined

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
      <Wifi className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-green-900 dark:text-green-100">{t('nmea.connected')}</p>
        <NMEAStatusLine connected={connected} data={data} />
      </div>
      <button
        type="button"
        onClick={() => onImport(data)}
        disabled={!hasAny}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
      >
        <NMEAIcon className="w-3.5 h-3.5" />
        {t('nmea.take')}
      </button>
    </div>
  )
}

export function NMEAStatusIndicator({ connected }: { connected: boolean }) {
  const { t } = useTranslation()
  if (connected) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <Wifi className="w-3 h-3" /> {t('nmea.statusConnected')}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-gray-400">
      <WifiOff className="w-3 h-3" /> {t('nmea.statusNotConnected')}
    </span>
  )
}
