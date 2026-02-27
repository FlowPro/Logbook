import { Menu, Moon, Sun, Globe, Wifi, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useSettings } from '../../hooks/useSettings'
import { useNMEAContext } from '../../contexts/NMEAContext'
import { useState, useEffect, useRef } from 'react'

interface HeaderProps {
  onMenuToggle: () => void
  title?: string
}

export function Header({ onMenuToggle, title }: HeaderProps) {
  const { t } = useTranslation()
  const { settings, updateSettings } = useSettings()
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // NMEA status – reads from the single persistent connection in AppLayout
  const { connected: wsConnected, data: nmeaData } = useNMEAContext()

  // Re-check data freshness every 15 s so the badge updates promptly when data goes stale
  const [tick, setTick] = useState(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!settings?.nmeaEnabled) return
    tickRef.current = setInterval(() => setTick(n => n + 1), 15_000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [settings?.nmeaEnabled])

  // Green only when WS is connected AND NMEA heartbeat/data received within the last 60 seconds
  const DATA_STALE_MS = 60 * 1000
  const dataFresh = nmeaData.updatedAt != null && (Date.now() - nmeaData.updatedAt + tick * 0) < DATA_STALE_MS
  const nmeaActive = wsConnected && dataFresh
  // "connecting": WS is open but no data yet (first connection, NMEA device not yet sending)
  const nmeaConnecting = wsConnected && nmeaData.updatedAt == null

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  function toggleDarkMode() {
    updateSettings({ darkMode: !settings?.darkMode })
  }

  function toggleLanguage() {
    updateSettings({ language: settings?.language === 'de' ? 'en' : 'de' })
  }

  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 gap-3 flex-shrink-0 sticky top-0 z-20">
      {/* Mobile menu button */}
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 md:hidden transition-colors"
        aria-label="Toggle menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Title – hidden on desktop where the sidebar already shows the active page */}
      <div className="flex-1 min-w-0">
        {title && (
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate lg:hidden">
            {title}
          </h1>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1">

        {/* NMEA status (only when enabled) – links to NMEA section in Settings */}
        {settings?.nmeaEnabled && (
          <div className="relative group">
            <Link
              to="/settings#nmea"
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                nmeaActive
                  ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 hover:bg-green-100 dark:hover:bg-green-900'
                  : nmeaConnecting
                    ? 'text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900'
                    : wsConnected
                      ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900'
                      : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                nmeaActive ? 'bg-green-500'
                : nmeaConnecting ? 'bg-blue-400 animate-pulse'
                : wsConnected ? 'bg-amber-400'
                : 'bg-gray-400'
              }`} />
              <span className="hidden sm:inline">NMEA</span>
            </Link>
            {/* Custom tooltip – no browser delay, shows colored state legend */}
            <div className="absolute top-full right-0 mt-1.5 w-64 rounded-xl bg-gray-900 dark:bg-gray-800 shadow-xl border border-white/10 p-2.5 space-y-1.5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
              {([
                { dot: 'bg-green-500',              label: 'Grün',  desc: 'NMEA aktiv – Daten empfangen',         active: nmeaActive },
                { dot: 'bg-blue-400 animate-pulse', label: 'Blau',  desc: 'Verbinde – warte auf NMEA-Gerät',      active: nmeaConnecting },
                { dot: 'bg-amber-400',              label: 'Gelb',  desc: 'Kein Datenstrom (> 60 s)',             active: wsConnected && !nmeaActive && !nmeaConnecting },
                { dot: 'bg-gray-400',               label: 'Grau',  desc: 'Bridge nicht verbunden',               active: !wsConnected },
              ] as const).map(({ dot, label, desc, active }) => (
                <div key={label} className={`flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs ${active ? 'bg-white/10' : ''}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                  <span className={`w-8 font-semibold flex-shrink-0 ${active ? 'text-white' : 'text-gray-400'}`}>{label}</span>
                  <span className={active ? 'text-white' : 'text-gray-500'}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Internet connectivity */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium ${
            isOnline
              ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950'
              : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950'
          }`}
          title={isOnline ? 'Online' : 'Offline'}
        >
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Language toggle */}
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
          title="Toggle language"
        >
          <Globe className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase">
            {settings?.language ?? 'de'}
          </span>
        </button>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
          title={settings?.darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {settings?.darkMode ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </div>
    </header>
  )
}
