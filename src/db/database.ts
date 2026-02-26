import Dexie, { type EntityTable } from 'dexie'
import type {
  Ship,
  CrewMember,
  LogEntry,
  PassageEntry,
  MaintenanceEntry,
  AppSettings,
  WatchEntry,
  SafetyChecklist,
} from './models'

class LogbuchDatabase extends Dexie {
  ship!: EntityTable<Ship, 'id'>
  crew!: EntityTable<CrewMember, 'id'>
  logEntries!: EntityTable<LogEntry, 'id'>
  passages!: EntityTable<PassageEntry, 'id'>
  maintenance!: EntityTable<MaintenanceEntry, 'id'>
  settings!: EntityTable<AppSettings, 'id'>
  watches!: EntityTable<WatchEntry, 'id'>
  checklists!: EntityTable<SafetyChecklist, 'id'>

  constructor() {
    super('LogbuchDB')

    this.version(1).stores({
      ship: '++id, name, flag, mmsi',
      crew: '++id, lastName, firstName, role, isActive, onBoardFrom, onBoardTo',
      logEntries: '++id, date, time, departurePort, destinationPort, watchOfficer',
      passages: '++id, departurePort, arrivalPort, departureDate, arrivalDate, customsCleared',
      maintenance: '++id, date, category, engineHoursAtService',
      settings: '++id',
      watches: '++id, date, watchOfficer',
      checklists: '++id, date, type',
    })

    this.version(2).stores({
      logEntries: '++id, date, time, [date+time], departurePort, destinationPort, watchOfficer',
    })

    this.version(3).stores({
      logEntries: '++id, passageId, date, time, [date+time], watchOfficer',
    })

    this.version(4).stores({
      maintenance: '++id, date, category, status, engineHoursAtService',
    })

    // v5: Compound [passageId+date] for fast per-passage date-range queries.
    //     Writes a localStorage flag so AppLayout can notify the user.
    this.version(5).stores({
      logEntries: '++id, passageId, date, time, [date+time], [passageId+date], watchOfficer',
    }).upgrade(() => {
      try { localStorage.setItem('logbuch_migration_pending', '5') } catch { /* SSR / private mode */ }
    })
  }
}

export const db = new LogbuchDatabase()

// ── Default settings ──────────────────────────────────────
export async function initSettings(): Promise<void> {
  const count = await db.settings.count()
  if (count === 0) {
    await db.settings.add({
      language: 'de',
      distanceUnit: 'nm',
      speedUnit: 'kts',
      tempUnit: 'celsius',
      darkMode: false,
      autoBackup: true,
      updatedAt: new Date().toISOString(),
    })
  }
}

// ── Seed data for development ─────────────────────────────
export async function seedDemoData(): Promise<void> {
  const existing = await db.logEntries.count()
  if (existing > 0) return

  const now = new Date()
  const iso = now.toISOString()

  // Demo ship
  const shipCount = await db.ship.count()
  if (shipCount === 0) {
    await db.ship.add({
      name: 'SV Wanderer',
      type: 'Segelyacht',
      manufacturer: 'Hallberg-Rassy',
      model: 'HR 46',
      yearBuilt: 2015,
      flag: 'DE',
      homePort: 'Hamburg',
      registrationNumber: 'HH-1234',
      registrationCountry: 'Germany',
      mmsi: '211234567',
      callSign: 'DAHW',
      imoNumber: '',
      loaMeters: 14.2,
      beamMeters: 4.4,
      draftMeters: 1.95,
      displacementTons: 12.5,
      sailAreaSqm: 95,
      engineType: 'Volvo Penta D2-55',
      enginePowerKw: 40,
      fuelCapacityL: 220,
      fuelType: 'Diesel',
      waterCapacityL: 400,
      insuranceCompany: 'Pantaenius',
      insurancePolicyNr: 'PA-2024-12345',
      insuranceValidity: '2024-01-01',
      insuranceExpiry: '2025-12-31',
      documents: [],
      createdAt: iso,
      updatedAt: iso,
    })
  }
}

// ── Clear log data (danger zone) ─────────────────────────
export async function clearLogData(): Promise<void> {
  await Promise.all([
    db.logEntries.clear(),
    db.passages.clear(),
  ])
}

// ── Export/Import for backup ──────────────────────────────
export async function exportAllData(): Promise<string> {
  const [ship, crew, logEntries, passages, maintenance, watches, checklists] = await Promise.all([
    db.ship.toArray(),
    db.crew.toArray(),
    db.logEntries.toArray(),
    db.passages.toArray(),
    db.maintenance.toArray(),
    db.watches.toArray(),
    db.checklists.toArray(),
  ])

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { ship, crew, logEntries, passages, maintenance, watches, checklists },
  }

  return JSON.stringify(backup, null, 2)
}

export async function importAllData(jsonString: string): Promise<void> {
  const backup = JSON.parse(jsonString)
  if (!backup.version || !backup.data) {
    throw new Error('Invalid backup file format')
  }

  const { data } = backup

  // Clear existing data
  await Promise.all([
    db.ship.clear(),
    db.crew.clear(),
    db.logEntries.clear(),
    db.passages.clear(),
    db.maintenance.clear(),
    db.watches.clear(),
    db.checklists.clear(),
  ])

  // Restore data
  if (data.ship?.length) await db.ship.bulkAdd(data.ship)
  if (data.crew?.length) await db.crew.bulkAdd(data.crew)
  if (data.logEntries?.length) await db.logEntries.bulkAdd(data.logEntries)
  if (data.passages?.length) await db.passages.bulkAdd(data.passages)
  if (data.maintenance?.length) await db.maintenance.bulkAdd(data.maintenance)
  if (data.watches?.length) await db.watches.bulkAdd(data.watches)
  if (data.checklists?.length) await db.checklists.bulkAdd(data.checklists)
}
