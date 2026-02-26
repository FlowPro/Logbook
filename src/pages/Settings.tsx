import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { Moon, Globe, Ruler, Info, AlertTriangle, Trash2, FolderOpen, FolderX, Clock, Wifi, ChevronDown, Download, Upload } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { useSettings } from '../hooks/useSettings'
import { db, clearLogData, exportAllData, importAllData } from '../db/database'
import { getBackupDirLabel, setBackupDir, clearBackupDir, saveBackupFileWithPicker } from '../utils/backupDir'
import { Card, CardHeader } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Select } from '../components/ui/Select'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { NMEAStatusIndicator } from '../components/ui/NMEAImportPanel'
import { NMEADebugPanel } from '../components/ui/NMEADebugPanel'

function datePrefix(): string {
  return new Date().toISOString().split('T')[0].replace(/-/g, '.')
}

interface BridgeStatus {
  nmeaConnected: boolean
  wsClients: number
  config: { nmea: { host: string; port: number; protocol: 'tcp' | 'udp'; reconnectIntervalMs: number } }
}

function getApiBase(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):\/\//, 'http$1://')
}

export function Settings() {
  const { t } = useTranslation()
  const { settings, updateSettings } = useSettings()
  const location = useLocation()
  const [clearing, setClearing] = useState(false)
  const [backupLoading, setBackupLoading] = useState(false)
  const [restorePendingFile, setRestorePendingFile] = useState<File | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Bridge connection state (polling /api/status on port 3001)
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null)

  // Debounced NMEA-device connection display – only switch to false after 5 s to prevent flicker
  const [stableNmeaConnected, setStableNmeaConnected] = useState(false)
  const nmeaConnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (bridgeStatus?.nmeaConnected === true) {
      if (nmeaConnTimer.current) { clearTimeout(nmeaConnTimer.current); nmeaConnTimer.current = null }
      setStableNmeaConnected(true)
    } else {
      if (!nmeaConnTimer.current) {
        nmeaConnTimer.current = setTimeout(() => {
          setStableNmeaConnected(false)
          nmeaConnTimer.current = null
        }, 5000)
      }
    }
    return () => { if (nmeaConnTimer.current) { clearTimeout(nmeaConnTimer.current); nmeaConnTimer.current = null } }
  }, [bridgeStatus?.nmeaConnected])

  // Process control state (polling /api/bridge-control/status on Vite dev server)
  const [processRunning, setProcessRunning] = useState(false)
  const [processControlAvailable, setProcessControlAvailable] = useState(false)
  const [processSwitching, setProcessSwitching] = useState(false)

  // NMEA device form
  const [nmeaForm, setNmeaForm] = useState({
    host: '192.168.0.1', port: 10110, protocol: 'tcp' as 'tcp' | 'udp', reconnectIntervalMs: 5000,
  })
  const nmeaFormLoaded = useRef(false)
  const [nmeaSaving, setNmeaSaving] = useState(false)
  const [nmeaSaveError, setNmeaSaveError] = useState('')

  // Collapsible sections – Appearance open by default; auto-open section from URL hash (e.g. /settings#nmea)
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const initial = new Set<string>(['appearance'])
    const hash = location.hash.slice(1)
    if (hash) initial.add(hash)
    return initial
  })
  function toggleSection(id: string) {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const entriesCount = useLiveQuery(() => db.logEntries.count()) ?? 0
  const passagesCount = useLiveQuery(() => db.passages.count()) ?? 0
  const [backupDirLabel, setBackupDirLabelState] = useState<string | null>(null)

  useEffect(() => {
    getBackupDirLabel().then(setBackupDirLabelState)
  }, [])

  // Poll bridge process status + bridge connection status every 2 seconds
  useEffect(() => {
    if (!settings?.nmeaEnabled) {
      setBridgeStatus(null)
      setProcessRunning(false)
      return
    }
    const apiBase = getApiBase('ws://localhost:3001')

    async function poll() {
      // 1. Check if the Vite bridge-control plugin is available
      try {
        const res = await fetch('/api/bridge-control/status', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json() as { running: boolean }
          setProcessRunning(data.running)
          setProcessControlAvailable(true)
        } else {
          setProcessControlAvailable(false)
        }
      } catch {
        setProcessControlAvailable(false)
      }

      // 2. Check bridge server connection (port 3001)
      try {
        const res = await fetch(`${apiBase}/api/status`)
        if (!res.ok) throw new Error('not ok')
        const status = await res.json() as BridgeStatus
        setBridgeStatus(status)
        if (!nmeaFormLoaded.current) {
          setNmeaForm(status.config.nmea)
          nmeaFormLoaded.current = true
        }
      } catch {
        setBridgeStatus(null)
      }
    }

    poll()
    const id = setInterval(poll, 2000)
    return () => {
      clearInterval(id)
      nmeaFormLoaded.current = false
    }
  }, [settings?.nmeaEnabled])

  async function handleMainNmeaToggle() {
    const enabling = !settings?.nmeaEnabled
    updateSettings({ nmeaEnabled: enabling })
    if (processControlAvailable) {
      setProcessSwitching(true)
      try {
        const endpoint = enabling ? '/api/bridge-control/start' : '/api/bridge-control/stop'
        await fetch(endpoint, { method: 'POST' }).catch(() => {})
      } finally {
        setProcessSwitching(false)
      }
    }
  }

  async function handlePickBackupDir() {
    if (!('showDirectoryPicker' in window)) {
      alert('Your browser does not support folder selection.\nBitte Chrome oder Edge verwenden.')
      return
    }
    try {
      const handle = await (
        window as Window & { showDirectoryPicker(o?: object): Promise<{ name: string; requestPermission(o: object): Promise<string>; getFileHandle(n: string, o?: object): Promise<unknown> }> }
      ).showDirectoryPicker({ mode: 'readwrite' })
      await setBackupDir(handle as Parameters<typeof setBackupDir>[0])
      setBackupDirLabelState(handle.name)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') throw e
    }
  }

  async function handleClearBackupDir() {
    await clearBackupDir()
    setBackupDirLabelState(null)
  }

  async function handleBackup() {
    setBackupLoading(true)
    try {
      const json = await exportAllData()
      const filename = `${datePrefix()} - Logbuch Backup.zip`
      await saveBackupFileWithPicker(json, filename)
    } finally {
      setBackupLoading(false)
    }
  }

  function handleRestoreSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setRestorePendingFile(file)
    e.target.value = ''
  }

  async function executeRestore() {
    if (!restorePendingFile) return
    const file = restorePendingFile
    setRestorePendingFile(null)
    try {
      let jsonText: string
      if (file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
        const JSZip = (await import('jszip')).default
        const zip = await JSZip.loadAsync(file)
        const jsonFile = zip.file('backup.json')
        if (!jsonFile) throw new Error('No backup.json found in ZIP')
        jsonText = await jsonFile.async('string')
      } else {
        jsonText = await file.text()
      }
      await importAllData(jsonText)
      toast.success('Daten erfolgreich wiederhergestellt!')
    } catch {
      toast.error('Fehler beim Wiederherstellen der Daten.')
    }
  }

  async function executeClearLogData() {
    setShowClearConfirm(false)
    setClearing(true)
    try {
      await clearLogData()
      toast.success('Alle Logdaten gelöscht.')
    } finally {
      setClearing(false)
    }
  }

  async function handleNmeaSave() {
    const apiBase = getApiBase('ws://localhost:3001')
    setNmeaSaving(true)
    setNmeaSaveError('')
    try {
      const res = await fetch(`${apiBase}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nmeaForm),
      })
      if (!res.ok) throw new Error('Server-Fehler')
      nmeaFormLoaded.current = false
    } catch {
      setNmeaSaveError('Konnte nicht gespeichert werden — Bridge-Server nicht erreichbar.')
    } finally {
      setNmeaSaving(false)
    }
  }

  async function handleNmeaConnect() {
    const apiBase = getApiBase('ws://localhost:3001')
    await fetch(`${apiBase}/api/connect`, { method: 'POST' })
  }

  async function handleNmeaDisconnect() {
    const apiBase = getApiBase('ws://localhost:3001')
    await fetch(`${apiBase}/api/disconnect`, { method: 'POST' })
  }

  if (!settings) {
    return <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      {/* Language */}
      <Card>
        <CardHeader title={t('settings.language')} icon={<Globe className="w-4 h-4" />} />
        <div className="flex gap-3">
          {(['de', 'en'] as const).map(lang => (
            <button
              key={lang}
              onClick={() => updateSettings({ language: lang })}
              className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-colors ${
                settings.language === lang
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {lang === 'de' ? '🇩🇪 Deutsch' : '🇬🇧 English'}
            </button>
          ))}
        </div>
      </Card>

      {/* Appearance */}
      <Card>
        <button type="button" onClick={() => toggleSection('appearance')} className="w-full flex items-center justify-between gap-2 text-left">
          <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
            <Moon className="w-4 h-4 text-gray-500" />
            {t('settings.appearance')}
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openSections.has('appearance') ? 'rotate-180' : ''}`} />
        </button>
        {openSections.has('appearance') && (
        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="font-medium">{t('settings.darkMode')}</p>
            <p className="text-sm text-gray-500">{t('settings.darkModeHint')}</p>
          </div>
          <button
            onClick={() => updateSettings({ darkMode: !settings.darkMode })}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              settings.darkMode ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                settings.darkMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
            <span className="sr-only">Toggle dark mode</span>
          </button>
        </div>
        )}
      </Card>

      {/* Units & Currency */}
      <Card>
        <button type="button" onClick={() => toggleSection('units')} className="w-full flex items-center justify-between gap-2 text-left">
          <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
            <Ruler className="w-4 h-4 text-gray-500" />
            {t('settings.units')}
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openSections.has('units') ? 'rotate-180' : ''}`} />
        </button>
        {openSections.has('units') && (
        <div className="mt-4 space-y-4">
          <Select
            label={t('settings.distanceUnit')}
            options={[
              { value: 'nm', label: 'Seemeilen (nm)' },
              { value: 'km', label: 'Kilometer (km)' },
            ]}
            value={settings.distanceUnit}
            onChange={e => updateSettings({ distanceUnit: e.target.value as 'nm' | 'km' })}
          />
          <Select
            label={t('settings.speedUnit')}
            options={[
              { value: 'kts', label: 'Knoten (kn)' },
              { value: 'kmh', label: 'km/h' },
              { value: 'ms', label: 'm/s' },
            ]}
            value={settings.speedUnit}
            onChange={e => updateSettings({ speedUnit: e.target.value as 'kts' | 'kmh' | 'ms' })}
          />
          <Select
            label={t('settings.tempUnit')}
            options={[
              { value: 'celsius', label: 'Celsius (°C)' },
              { value: 'fahrenheit', label: 'Fahrenheit (°F)' },
            ]}
            value={settings.tempUnit}
            onChange={e => updateSettings({ tempUnit: e.target.value as 'celsius' | 'fahrenheit' })}
          />
          <Select
            label="Standard-Währung (Wartung)"
            options={[
              'EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK',
              'AUD', 'CAD', 'JPY', 'NZD', 'SGD', 'ZAR', 'BRL',
            ].map(c => ({ value: c, label: c }))}
            value={settings.defaultCurrency ?? 'EUR'}
            onChange={e => updateSettings({ defaultCurrency: e.target.value })}
          />
        </div>
        )}
      </Card>

      {/* Auto backup */}
      <Card>
        <button type="button" onClick={() => toggleSection('backup')} className="w-full flex items-center justify-between gap-2 text-left">
          <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
            <Info className="w-4 h-4 text-gray-500" />
            {t('settings.backup')}
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openSections.has('backup') ? 'rotate-180' : ''}`} />
        </button>
        {openSections.has('backup') && (
        <div className="mt-4 space-y-4">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('settings.autoBackup')}</p>
              <p className="text-sm text-gray-500">Tägliche automatische Sicherung</p>
              {settings.autoBackup && (
                <div className="mt-1 space-y-0.5">
                  {settings.lastBackupDate ? (
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Letztes Backup: {new Date(settings.lastBackupDate).toLocaleDateString('de-DE')} um {new Date(settings.lastBackupDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">Noch kein automatisches Backup erstellt</p>
                  )}
                  {settings.lastBackupDate && (() => {
                    const next = new Date(settings.lastBackupDate)
                    next.setDate(next.getDate() + 1)
                    return (
                      <p className="text-xs text-blue-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Nächstes Backup: {next.toLocaleDateString('de-DE')} (beim App-Start)
                      </p>
                    )
                  })()}
                </div>
              )}
            </div>
            <button
              onClick={() => updateSettings({ autoBackup: !settings.autoBackup })}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                settings.autoBackup ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  settings.autoBackup ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Backup directory picker */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <p className="text-sm font-medium mb-1">Backup-Ordner / Backup Folder</p>
            {backupDirLabel ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 min-w-0">
                  <FolderOpen className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate font-mono">{backupDirLabel}</span>
                </div>
                <button
                  onClick={handleClearBackupDir}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 flex-shrink-0"
                  title="Ordner entfernen"
                >
                  <FolderX className="w-3.5 h-3.5" />
                  Entfernen
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-400 italic">Kein Ordner ausgewählt — Standard Downloads</p>
                <Button size="sm" variant="secondary" icon={<FolderOpen className="w-4 h-4" />} onClick={handlePickBackupDir}>
                  Wählen
                </Button>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-2">
              Speichert Backups direkt in den gewählten Ordner (z.B. USB-Stick). Erfordert Chrome oder Edge.
            </p>
          </div>

          {/* Manual backup & restore */}
          <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Manuelles Backup</p>
            <div className="flex items-start justify-between gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="min-w-0">
                <p className="font-medium text-sm">{t('export.backupData')}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t('export.backupNote')}</p>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{datePrefix()} - Logbuch Backup.zip</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                icon={<Download className="w-4 h-4" />}
                onClick={handleBackup}
                loading={backupLoading}
              >
                {t('common.export')}
              </Button>
            </div>
            <div className="flex items-start justify-between gap-4 p-3 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
              <div>
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  <p className="font-medium text-sm text-red-700 dark:text-red-400">{t('export.restoreData')}</p>
                </div>
                <p className="text-xs text-red-500 mt-0.5">{t('export.restoreNote')}</p>
              </div>
              <label className="cursor-pointer flex-shrink-0">
                <span className="btn-danger text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg">
                  <Upload className="w-3.5 h-3.5" />
                  {t('common.import')}
                </span>
                <input type="file" accept=".zip,.json" onChange={handleRestoreSelect} className="hidden" />
              </label>
            </div>
          </div>
        </div>
        )}
      </Card>

      {/* NMEA Bridge */}
      <Card>
        <button type="button" onClick={() => toggleSection('nmea')} className="w-full flex items-center justify-between gap-2 text-left">
          <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
            <Wifi className="w-4 h-4 text-gray-500" />
            {t('settings.nmeaIntegration')}
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openSections.has('nmea') ? 'rotate-180' : ''}`} />
        </button>
        {openSections.has('nmea') && (
        <div className="mt-4 space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">NMEA Bridge</p>
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">NMEA 0183</span>
              </div>
              <p className="text-sm text-gray-500">
                {processControlAvailable
                  ? 'Aktiviert NMEA-0183-Datenimport und startet den Bridge-Server'
                  : 'Importiert GPS, Wind und Wetterdaten (NMEA 0183) aus dem Bordnetz'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleMainNmeaToggle}
              disabled={processSwitching}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-60 ${
                settings.nmeaEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  settings.nmeaEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {settings.nmeaEnabled && (
            <>
              {/* Server status box */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Bridge-Server</p>

                {/* Bridge connection status */}
                {bridgeStatus === null ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0" />
                      Bridge nicht erreichbar
                    </div>
                    {!processControlAvailable && (
                      <div className="space-y-1">
                        <p className="text-xs text-gray-400">Starte den Bridge-Server:</p>
                        <code className="block text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">npm run server</code>
                        <code className="block text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">npm run dev:nmea</code>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                      Bridge aktiv · {bridgeStatus.wsClients} {bridgeStatus.wsClients === 1 ? 'Client' : 'Clients'}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <NMEAStatusIndicator connected={stableNmeaConnected} />
                      {stableNmeaConnected ? (
                        <Button type="button" size="sm" variant="secondary" onClick={handleNmeaDisconnect}>
                          Trennen
                        </Button>
                      ) : (
                        <Button type="button" size="sm" variant="primary" onClick={handleNmeaConnect}>
                          Verbinden
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* NMEA device config */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">NMEA-Gerät</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Host"
                    type="text"
                    value={nmeaForm.host}
                    onChange={e => setNmeaForm(f => ({ ...f, host: e.target.value }))}
                  />
                  <Input
                    label="Port"
                    type="number"
                    value={nmeaForm.port}
                    onChange={e => setNmeaForm(f => ({ ...f, port: parseInt(e.target.value) || f.port }))}
                  />
                </div>
                <Select
                  label="Protokoll"
                  options={[
                    { value: 'tcp', label: 'TCP' },
                    { value: 'udp', label: 'UDP' },
                  ]}
                  value={nmeaForm.protocol}
                  onChange={e => setNmeaForm(f => ({ ...f, protocol: e.target.value as 'tcp' | 'udp' }))}
                />
                <div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={nmeaSaving}
                    loading={nmeaSaving}
                    onClick={handleNmeaSave}
                  >
                    Speichern & Verbinden
                  </Button>
                  {nmeaSaveError && (
                    <p className="text-xs text-red-500 mt-1.5">{nmeaSaveError}</p>
                  )}
                </div>
              </div>

              {/* Debug panel – always visible when NMEA enabled */}
              <div className="mt-2">
                <NMEADebugPanel wsUrl="ws://localhost:3001" />
              </div>
            </>
          )}
        </div>
        )}
      </Card>

      {/* Danger zone */}
      <Card>
        <button type="button" onClick={() => toggleSection('danger')} className="w-full flex items-center justify-between gap-2 text-left">
          <div className="flex items-center gap-2 font-semibold text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4" />
            {t('settings.dangerZone')}
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openSections.has('danger') ? 'rotate-180' : ''}`} />
        </button>
        {openSections.has('danger') && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
          <h4 className="font-semibold text-sm text-red-700 dark:text-red-400 mb-1">Logbuch zurücksetzen</h4>
          <p className="text-sm text-red-600 dark:text-red-500 mb-3">
            Löscht alle {entriesCount} Logeinträge und {passagesCount} Passagen unwiderruflich.
            Schiffsdaten, Crew und Einstellungen bleiben erhalten.
          </p>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 className="w-4 h-4" />}
            onClick={() => setShowClearConfirm(true)}
            loading={clearing}
            disabled={entriesCount === 0 && passagesCount === 0}
          >
            Alle Logdaten löschen
          </Button>
        </div>
        )}
      </Card>

      {/* About */}
      <Card>
        <button type="button" onClick={() => toggleSection('about')} className="w-full flex items-center justify-between gap-2 text-left">
          <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
            <Info className="w-4 h-4 text-gray-500" />
            {t('settings.about')}
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openSections.has('about') ? 'rotate-180' : ''}`} />
        </button>
        {openSections.has('about') && (
        <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex justify-between">
            <span>{t('settings.version')}</span>
            <span className="font-mono">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span>Tech Stack</span>
            <span className="font-mono text-xs">React 18 + Dexie + Tailwind</span>
          </div>
          <div className="flex justify-between">
            <span>Datenspeicherung</span>
            <span>IndexedDB (lokal)</span>
          </div>
          <div className="flex justify-between">
            <span>Offline-fähig</span>
            <span className="text-green-600">✓ PWA</span>
          </div>
        </div>
        )}
      </Card>

      {/* Restore confirm modal */}
      <Modal
        isOpen={restorePendingFile !== null}
        onClose={() => setRestorePendingFile(null)}
        title="Backup wiederherstellen"
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRestorePendingFile(null)}>Abbrechen</Button>
            <Button variant="danger" size="sm" onClick={executeRestore}>Jetzt wiederherstellen</Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Alle vorhandenen Daten werden überschrieben!</p>
            <p className="text-sm text-gray-500 mt-1">Datei: <span className="font-mono">{restorePendingFile?.name}</span></p>
            <p className="text-sm text-gray-500 mt-1">Diese Aktion kann nicht rückgängig gemacht werden.</p>
          </div>
        </div>
      </Modal>

      {/* Clear all data confirm modal */}
      <Modal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="Logbuch zurücksetzen"
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowClearConfirm(false)}>Abbrechen</Button>
            <Button variant="danger" size="sm" onClick={executeClearLogData}>Unwiderruflich löschen</Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Alle {entriesCount} Logeinträge und {passagesCount} Passagen werden gelöscht.
            </p>
            <p className="text-sm text-gray-500 mt-1">Diese Aktion kann NICHT rückgängig gemacht werden.</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
