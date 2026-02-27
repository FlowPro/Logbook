import { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Toaster, toast } from 'sonner'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useSettings } from '../../hooks/useSettings'
import { useNMEA } from '../../hooks/useNMEA'
import { NMEAContext } from '../../contexts/NMEAContext'
import { exportAllData } from '../../db/database'
import { saveBackupFile } from '../../utils/backupDir'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

type ChildHandle = { kill(): Promise<void> }

const routeTitles: Record<string, string> = {
  '/': 'nav.dashboard',
  '/log/new': 'nav.newEntry',
  '/ship': 'nav.ship',
  '/crew': 'nav.crew',
  '/summary': 'nav.summary',
  '/ports': 'nav.portLog',
  '/maintenance': 'nav.maintenance',
  '/export': 'nav.export',
  '/settings': 'nav.settings',
  '/emergency': 'nav.emergency',
  '/safety': 'nav.safety',
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const { t } = useTranslation()
  const { settings, updateSettings } = useSettings()

  // Single persistent NMEA WebSocket for the entire app session
  const nmeaWsUrl = settings?.nmeaEnabled
    ? (settings.nmeaBridgeUrl ?? 'ws://localhost:3001')
    : undefined
  const nmea = useNMEA(nmeaWsUrl)

  // NMEA bridge sidecar – only active in Tauri desktop builds
  const bridgeChild = useRef<ChildHandle | null>(null)
  const bridgeSpawning = useRef(false)

  async function spawnBridge() {
    if (bridgeSpawning.current) return
    bridgeSpawning.current = true
    try {
      const res = await fetch('http://localhost:3001/api/status', { signal: AbortSignal.timeout(2000) }).catch(() => null)
      if (res?.ok) return // already running (external or previous sidecar still alive)
      bridgeChild.current = null
      const { Command } = await import('@tauri-apps/plugin-shell')
      const command = Command.sidecar('binaries/nmea-bridge')
      command.stdout.on('data', (line: string) => console.log('[sidecar]', line))
      command.stderr.on('data', (line: string) => {
        console.warn('[sidecar stderr]', line)
        try {
          const prev = localStorage.getItem('nmea_sidecar_log') ?? ''
          localStorage.setItem('nmea_sidecar_log', (prev + line + '\n').slice(-3000))
        } catch { /* ignore */ }
      })
      const child = await command.spawn()
      bridgeChild.current = child
    } catch (e) {
      console.error('[sidecar] Failed to start NMEA bridge:', e)
      try {
        const msg = e instanceof Error ? e.message : String(e)
        localStorage.setItem('nmea_sidecar_log', `[spawn error] ${msg}\n`)
      } catch { /* ignore */ }
    } finally {
      bridgeSpawning.current = false
    }
  }

  useEffect(() => {
    if (!isTauri) return
    if (!settings?.nmeaEnabled) {
      bridgeChild.current?.kill().catch(() => {})
      bridgeChild.current = null
      return
    }

    spawnBridge()

    // Re-check every 30 s and respawn if bridge went down
    const id = setInterval(async () => {
      const res = await fetch('http://localhost:3001/api/status', { signal: AbortSignal.timeout(2000) }).catch(() => null)
      if (!res?.ok) spawnBridge()
    }, 30_000)

    return () => clearInterval(id)
  }, [settings?.nmeaEnabled])

  // Apply dark mode on settings change
  useEffect(() => {
    if (settings?.darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [settings?.darkMode])

  // Daily auto-backup (runs once per calendar day if enabled)
  useEffect(() => {
    if (!settings?.autoBackup) return
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    // Compare only the date portion of the stored ISO timestamp
    if (settings.lastBackupDate?.slice(0, 10) === today) return
    ;(async () => {
      try {
        const json = await exportAllData()
        const datePrefix = today.replace(/-/g, '.')
        const timePrefix = now.toTimeString().slice(0, 5).replace(':', '.')
        await saveBackupFile(json, `${datePrefix} ${timePrefix} - Logbuch Backup.zip`)
        await updateSettings({ lastBackupDate: now.toISOString() })
      } catch {
        // Silent fail — auto-backup should never interrupt the user
      }
    })()
  }, [settings?.autoBackup, settings?.lastBackupDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Notify user when a DB schema migration occurred on startup
  useEffect(() => {
    try {
      const pending = localStorage.getItem('logbuch_migration_pending')
      if (pending) {
        localStorage.removeItem('logbuch_migration_pending')
        toast('Datenbank aktualisiert (Schema v' + pending + ')', {
          description: 'Empfehlung: Manuelles Backup unter Einstellungen erstellen.',
          duration: 12_000,
        })
      }
    } catch { /* localStorage not available */ }
  }, [])

  const titleKey = routeTitles[location.pathname]
  const title = titleKey ? t(titleKey) : ''

  return (
    <NMEAContext.Provider value={nmea}>
      <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
        <Toaster
          richColors
          position="bottom-right"
          theme={settings?.darkMode ? 'dark' : 'light'}
        />
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header onMenuToggle={() => setSidebarOpen(v => !v)} title={title} />
          <main className="flex-1 overflow-y-auto">
            <div className="p-4 md:p-6 max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </NMEAContext.Provider>
  )
}
