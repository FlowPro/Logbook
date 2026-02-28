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
  StorageArea,
  StorageSection,
  StorageItem,
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
  storageAreas!: EntityTable<StorageArea, 'id'>
  storageSections!: EntityTable<StorageSection, 'id'>
  storageItems!: EntityTable<StorageItem, 'id'>

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

    // v6: Storage / Lagerplan feature — flat single-level sections (replaced by v7).
    this.version(6).stores({
      storageSections: '++id, order',
      storageItems: '++id, sectionId, category, expiryDate',
    })

    // v7: Two-level hierarchy — StorageArea (Bereich) + StorageSection (Fach).
    //     Clears v6 flat sections (no user data yet) and seeds generic 2-level structure.
    this.version(7).stores({
      storageAreas:    '++id, order',
      storageSections: '++id, areaId, order',
      storageItems:    '++id, areaId, sectionId, category, expiryDate',
    }).upgrade(async tx => {
      await tx.table('storageSections').clear()
      await tx.table('storageItems').clear()
      // Seed handled by v8 (Boréal 47.2 structure)
    })

    // v8: Re-seeds Boréal 47.2 default structure when no items exist yet.
    //     Safe to run on existing DBs — skipped if the user already has items.
    //     (Superseded by v9 which has the final area/section list.)
    this.version(8).stores({}).upgrade(async tx => {
      const itemCount = await tx.table('storageItems').count()
      if (itemCount > 0) return
      await tx.table('storageAreas').clear()
      await tx.table('storageSections').clear()
      // Seeding done in v9
    })

    // v9: Passthrough — clears intermediate seed, final structure in v10.
    this.version(9).stores({}).upgrade(async tx => {
      const itemCount = await tx.table('storageItems').count()
      if (itemCount > 0) return
      await tx.table('storageAreas').clear()
      await tx.table('storageSections').clear()
      // Seeding done in v10
    })

    // v10: Passthrough — clears intermediate seed, final structure in v11.
    this.version(10).stores({}).upgrade(async tx => {
      const itemCount = await tx.table('storageItems').count()
      if (itemCount > 0) return
      await tx.table('storageAreas').clear()
      await tx.table('storageSections').clear()
      // Seeding done in v11
    })

    // v11: Passthrough — clears intermediate seed, final structure in v12.
    this.version(11).stores({}).upgrade(async tx => {
      const itemCount = await tx.table('storageItems').count()
      if (itemCount > 0) return
      await tx.table('storageAreas').clear()
      await tx.table('storageSections').clear()
      // Seeding done in v12
    })

    // v12: Passthrough — clears intermediate seed, final structure in v13.
    this.version(12).stores({}).upgrade(async tx => {
      const itemCount = await tx.table('storageItems').count()
      if (itemCount > 0) return
      await tx.table('storageAreas').clear()
      await tx.table('storageSections').clear()
      // Seeding done in v13
    })

    // v13: Final Boréal 47.2 structure — Head Bug/SB, Lazarett, Bilge in allen Kabinen.
    this.version(13).stores({}).upgrade(async tx => {
      const itemCount = await tx.table('storageItems').count()
      if (itemCount > 0) return  // user has data → leave untouched

      await tx.table('storageAreas').clear()
      await tx.table('storageSections').clear()

      const now = new Date().toISOString()

      const areaRecords = [
        { name: 'Bugkabine',          icon: 'Bed',             color: 'slate',  order: 1,  createdAt: now },
        { name: 'Head Bug',           icon: 'Droplets',        color: 'blue',   order: 2,  createdAt: now },
        { name: 'Salon',              icon: 'Box',             color: 'amber',  order: 3,  createdAt: now },
        { name: 'Pantry',             icon: 'UtensilsCrossed', color: 'orange', order: 4,  createdAt: now },
        { name: 'Steuerstand',        icon: 'Compass',         color: 'green',  order: 5,  createdAt: now },
        { name: 'Maschinenraum',      icon: 'Settings2',       color: 'red',    order: 6,  createdAt: now },
        { name: 'Achterkabine BB',    icon: 'Bed',             color: 'pink',   order: 7,  createdAt: now },
        { name: 'Achterkabine SB',    icon: 'Bed',             color: 'purple', order: 8,  createdAt: now },
        { name: 'Head SB',            icon: 'Droplets',        color: 'teal',   order: 9,  createdAt: now },
        { name: 'Cockpit',            icon: 'Wind',            color: 'indigo', order: 10, createdAt: now },
        { name: 'Lazarett',           icon: 'Package',         color: 'slate',  order: 11, createdAt: now },
        { name: 'Vorschiff',          icon: 'Anchor',          color: 'blue',   order: 12, createdAt: now },
      ]
      const areaKeys = await tx.table('storageAreas').bulkAdd(areaRecords, { allKeys: true }) as number[]
      const [aBug, aHeadBug, aSalon, aPantry, aDog, aMasch, aAchterBB, aAchterSB, aHeadSB, aCockpit, aHeck, aVor] = areaKeys

      await tx.table('storageSections').bulkAdd([
        // Bugkabine (Eigner-Koje mit Gasdruckstütze)
        { areaId: aBug,     name: 'Koje (Gasdruckstütze)',        order: 1, createdAt: now },
        { areaId: aBug,     name: 'Schrank BB',                   order: 2, createdAt: now },
        { areaId: aBug,     name: 'Schrank SB',                   order: 3, createdAt: now },
        { areaId: aBug,     name: 'Bilge',                        order: 4, createdAt: now },
        // Head Bug (grosses Ensuite mit separater Dusche)
        { areaId: aHeadBug, name: 'Spiegelschrank',               order: 1, createdAt: now },
        { areaId: aHeadBug, name: 'Dusche',                       order: 2, createdAt: now },
        { areaId: aHeadBug, name: 'Ablage',                       order: 3, createdAt: now },
        // Salon
        { areaId: aSalon,  name: 'Sitzbank BB',                   order: 1, createdAt: now },
        { areaId: aSalon,  name: 'Sitzbank SB',                   order: 2, createdAt: now },
        { areaId: aSalon,  name: 'Schrank achtern BB',            order: 3, createdAt: now },
        { areaId: aSalon,  name: 'Schrank achtern SB',            order: 4, createdAt: now },
        { areaId: aSalon,  name: 'Bilge',                         order: 5, createdAt: now },
        // Pantry (SB-Seite)
        { areaId: aPantry, name: 'Oberschrank',                   order: 1, createdAt: now },
        { areaId: aPantry, name: 'Unterschrank',                  order: 2, createdAt: now },
        { areaId: aPantry, name: 'Kühlschrank',                   order: 3, createdAt: now },
        { areaId: aPantry, name: 'Gasflaschen',                   order: 4, createdAt: now },
        { areaId: aPantry, name: 'Bilge',                         order: 5, createdAt: now },
        // Steuerstand / Doghouse
        { areaId: aDog,    name: 'Kartentisch-Schubladen',        order: 1, createdAt: now },
        { areaId: aDog,    name: 'Navigationsschrank',            order: 2, createdAt: now },
        { areaId: aDog,    name: 'E-Schrank',                     order: 3, createdAt: now },
        { areaId: aDog,    name: 'Bilge',                         order: 4, createdAt: now },
        // Maschinenraum
        { areaId: aMasch,  name: 'Ersatzteile',                   order: 1, createdAt: now },
        { areaId: aMasch,  name: 'Werkzeug-Board',                order: 2, createdAt: now },
        { areaId: aMasch,  name: 'Bilge',                         order: 3, createdAt: now },
        // Achterkabine BB
        { areaId: aAchterBB, name: 'Koje',                        order: 1, createdAt: now },
        { areaId: aAchterBB, name: 'Schrank',                     order: 2, createdAt: now },
        { areaId: aAchterBB, name: 'Badezimmer',                  order: 3, createdAt: now },
        { areaId: aAchterBB, name: 'Bilge',                       order: 4, createdAt: now },
        // Achterkabine SB (optional: Tiefkühler)
        { areaId: aAchterSB, name: 'Koje / Tiefkühler',           order: 1, createdAt: now },
        { areaId: aAchterSB, name: 'Schrank',                     order: 2, createdAt: now },
        { areaId: aAchterSB, name: 'Bilge',                       order: 3, createdAt: now },
        // Head SB
        { areaId: aHeadSB, name: 'Spiegelschrank',                order: 1, createdAt: now },
        { areaId: aHeadSB, name: 'Ablage',                        order: 2, createdAt: now },
        // Cockpit (Backskisten unter den Sitzbänken)
        { areaId: aCockpit, name: 'Backskiste BB',                order: 1, createdAt: now },
        { areaId: aCockpit, name: 'Backskiste SB (Rettungsinsel)', order: 2, createdAt: now },
        // Lazarett (grosses Heckastauraum mit Doppelöffnung)
        { areaId: aHeck,   name: 'Lazarett BB',                   order: 1, createdAt: now },
        { areaId: aHeck,   name: 'Lazarett SB',                   order: 2, createdAt: now },
        // Vorschiff
        { areaId: aVor,    name: 'Segelschacht',                  order: 1, createdAt: now },
        { areaId: aVor,    name: 'Ankerkasten',                   order: 2, createdAt: now },
        { areaId: aVor,    name: 'Bugstauraum',                   order: 3, createdAt: now },
      ])
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
  const [ship, crew, logEntries, passages, maintenance, watches, checklists, storageAreas, storageSections, storageItems] = await Promise.all([
    db.ship.toArray(),
    db.crew.toArray(),
    db.logEntries.toArray(),
    db.passages.toArray(),
    db.maintenance.toArray(),
    db.watches.toArray(),
    db.checklists.toArray(),
    db.storageAreas.toArray(),
    db.storageSections.toArray(),
    db.storageItems.toArray(),
  ])

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { ship, crew, logEntries, passages, maintenance, watches, checklists, storageAreas, storageSections, storageItems },
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
    db.storageAreas.clear(),
    db.storageSections.clear(),
    db.storageItems.clear(),
  ])

  // Restore data
  if (data.ship?.length) await db.ship.bulkAdd(data.ship)
  if (data.crew?.length) await db.crew.bulkAdd(data.crew)
  if (data.logEntries?.length) await db.logEntries.bulkAdd(data.logEntries)
  if (data.passages?.length) await db.passages.bulkAdd(data.passages)
  if (data.maintenance?.length) await db.maintenance.bulkAdd(data.maintenance)
  if (data.watches?.length) await db.watches.bulkAdd(data.watches)
  if (data.checklists?.length) await db.checklists.bulkAdd(data.checklists)
  if (data.storageAreas?.length) await db.storageAreas.bulkAdd(data.storageAreas)
  if (data.storageSections?.length) await db.storageSections.bulkAdd(data.storageSections)
  if (data.storageItems?.length) await db.storageItems.bulkAdd(data.storageItems)
}
