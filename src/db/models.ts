// ============================================================
// DATA MODELS – Logbuch Maritime PWA
// ============================================================

export interface DocumentAttachment {
  id?: string
  name: string
  type: string
  data: string // base64
  size: number
  uploadedAt: string
}

// ── Ship / Vessel ─────────────────────────────────────────
/** Vessel types with their IRPCS/radio prefix (SV = sailing, MV = motor) */
export const VESSEL_TYPES: { value: string; prefix: 'SV' | 'MV' }[] = [
  { value: 'Segelyacht',     prefix: 'SV' },
  { value: 'Katamaran',      prefix: 'SV' },
  { value: 'Trimaran',       prefix: 'SV' },
  { value: 'Motorsailer',    prefix: 'SV' },
  { value: 'Motoryacht',     prefix: 'MV' },
  { value: 'Motorkatamaran', prefix: 'MV' },
  { value: 'Motorboot',      prefix: 'MV' },
]

export function getVesselPrefix(type?: string): 'SV' | 'MV' {
  return VESSEL_TYPES.find(t => t.value === type)?.prefix ?? 'SV'
}

export interface Ship {
  id?: number
  // Identity
  name: string
  type: string // e.g. "Segelyacht", "Katamaran"
  manufacturer: string
  model: string
  yearBuilt: number
  flag: string
  homePort: string
  // Registration
  registrationNumber: string
  registrationCountry: string
  mmsi: string
  callSign: string
  imoNumber: string
  // Dimensions
  loaMeters: number
  beamMeters: number
  draftMeters: number
  displacementTons: number
  sailAreaSqm: number
  // Engine
  engineType: string
  enginePowerKw: number
  fuelCapacityL: number
  fuelType: string
  // Tanks
  waterCapacityL: number
  // Insurance
  insuranceCompany: string
  insurancePolicyNr: string
  insuranceValidity: string
  insuranceExpiry: string
  // Contact (internal only – not printed on documents)
  contactEmail?: string
  contactPhone?: string
  // Documents
  documents: DocumentAttachment[]
  // Metadata
  createdAt: string
  updatedAt: string
}

// ── Crew Member ───────────────────────────────────────────
export type CrewRole = 'skipper' | 'crew' | 'passenger'

export interface SailingCertificate {
  name: string // e.g. "SRC", "OCC", "SKS"
  issuedBy: string
  issuedDate: string
  number: string
}

export interface CrewMember {
  id?: number
  // Personal
  firstName: string
  lastName: string
  dateOfBirth: string
  nationality: string
  // Document
  passportNumber: string
  passportExpiry: string
  passportCopy?: string // base64 image
  // Address
  street: string
  city: string
  postCode: string
  country: string
  // Contact
  phone: string
  email: string
  emergencyContact: string
  emergencyPhone: string
  // Medical (optional)
  bloodType?: string
  medications?: string
  allergies?: string
  // Qualifications
  qualifications: SailingCertificate[]
  // Role & dates
  role: CrewRole
  onBoardFrom: string
  onBoardTo?: string
  // Metadata
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// ── Log Entry ─────────────────────────────────────────────
export interface Coordinate {
  degrees: number
  minutes: number
  direction: 'N' | 'S' | 'E' | 'W'
}

export type PressureTrend = 'rising' | 'steady' | 'falling' | 'rising_rapidly' | 'falling_rapidly'
export type MooringStatus = 'underway' | 'anchored' | 'moored_marina' | 'moored_buoy' | 'moored_alongside'
export type Visibility = 'excellent' | 'good' | 'moderate' | 'poor' | 'fog'
export type SailConfig = 'full' | 'reefed1' | 'reefed2' | 'reefed3' | 'storm' | 'motorsailing' | 'motor' | 'heaved_to' | 'anchored' | 'custom'
export type MainsailState = 'none' | 'full' | 'reef1' | 'reef2' | 'reef3' | 'reef4'
export type GenoaState    = 'none' | 'full' | 'reef1' | 'reef2' | 'reef3'
export type StaysailState = 'none' | 'full' | 'reef1' | 'reef2' | 'reef3'
export type LightSailType = 'none' | 'code0' | 'gennaker' | 'parasail'
/** @deprecated use genoa + staysail instead */
export type HeadsailType  = 'none' | 'genoa' | 'foresail'

export interface LogEntry {
  id?: number
  // Passage reference (required)
  passageId: number
  // Timestamp
  date: string // ISO date string YYYY-MM-DD
  time: string // HH:MM UTC
  // Position
  latitude: Coordinate
  longitude: Coordinate
  // Navigation (optional – not always entered)
  courseTrue?: number // degrees 0-359
  courseMagnetic?: number
  speedOverGround?: number // knots
  speedThroughWater?: number
  // Distance
  distanceSinceLastEntry: number // nm
  // Wind
  windTrueDirection?: number // degrees
  windTrueSpeed: number // knots
  windBeaufort: number // 0-12
  windApparentDirection?: number
  windApparentSpeed?: number
  // Weather
  seaStateBeaufort: number // 0-9
  swellHeightM: number
  swellDirection?: number
  baroPressureHPa: number
  pressureTrend: PressureTrend
  visibility: Visibility
  cloudCoverOktas?: number // 0-8
  weatherDescription: string
  temperature?: number // Celsius
  // Engine
  engineOn: boolean
  engineRPM?: number
  engineHoursTotal?: number
  // Consumables
  fuelLevelL?: number
  waterLevelL?: number
  // Sails (legacy – optional for backwards compatibility)
  sailConfig?: SailConfig
  sailConfigCustom?: string
  reefPoints?: number
  // Sails (current individual sail fields)
  mainsailState?: MainsailState
  genoa?: GenoaState
  staysail?: StaysailState
  lightSail?: LightSailType
  // Sails (v1 legacy – superseded by genoa + staysail)
  headsail?: HeadsailType
  // Mooring / navigation status
  mooringStatus?: MooringStatus
  // Crew
  watchOfficer?: string
  crewOnWatch: string[]
  // Notes & attachments
  notes: string
  attachments: DocumentAttachment[]
  // Metadata
  createdAt: string
  updatedAt: string
}

// ── Passage / Port Log ────────────────────────────────────
export interface PassageEntry {
  id?: number
  // Departure
  departurePort: string
  departureCountry: string
  departureDate: string
  departureTime: string
  // Arrival
  arrivalPort: string
  arrivalCountry: string
  arrivalDate: string
  arrivalTime: string
  // Customs (legacy – single flag)
  customsCleared?: boolean
  // Customs (current – separate departure/arrival)
  customsClearedOut?: boolean   // Zoll ausklariert (departure port)
  customsClearedIn?: boolean    // Zoll einklariert (arrival port)
  customsNotesOut?: string  // notes for departure customs (Ausklarieren)
  customsNotesIn?: string   // notes for arrival customs (Einklarieren)
  customsOfficerName?: string  // legacy
  customsNotes?: string        // legacy
  // Lock – when true, passage and all its entries are read-only
  locked?: boolean
  // Crew manifest snapshot (JSON array of crew IDs)
  crewManifest: number[]
  // Notes
  notes: string
  // Metadata
  createdAt: string
  updatedAt: string
}

// ── Maintenance Entry ─────────────────────────────────────
export type MaintenanceCategory = 'engine' | 'rigging' | 'safety' | 'hull' | 'electronics' | 'sails' | 'other'
export type MaintenanceStatus   = 'planned' | 'in_progress' | 'done'
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'critical'

export interface MaintenanceChecklistItem {
  id: string
  text: string
  done: boolean
}

export type MaintenanceRecurrenceType = 'days' | 'weeks' | 'months' | 'years' | 'engine_hours'

export interface MaintenanceEntry {
  id?: number
  // Kanban fields (optional for backward compatibility with old entries)
  status?: MaintenanceStatus       // undefined → treat as 'done'
  priority?: MaintenancePriority   // undefined → treat as 'medium'
  dueDate?: string                 // when the task is due
  archivedAt?: string              // set when manually archived
  // Service record fields
  date?: string                    // completion date (undefined for planned/in_progress)
  engineHoursAtService?: number
  category: MaintenanceCategory
  description?: string             // task title / description
  nextServiceDueHours?: number
  nextServiceDueDate?: string
  cost?: number
  currency?: string
  performedBy?: string
  notes?: string
  // Subtask checklist
  checklist?: MaintenanceChecklistItem[]
  // Recurrence
  recurring?: boolean
  recurrenceType?: MaintenanceRecurrenceType
  recurrenceValue?: number
  // Metadata
  createdAt: string
  updatedAt: string
}

// ── Settings ──────────────────────────────────────────────
export type DistanceUnit = 'nm' | 'km'
export type SpeedUnit = 'kts' | 'kmh' | 'ms'
export type TempUnit = 'celsius' | 'fahrenheit'
export type Language = 'de' | 'en'

export interface AppSettings {
  id?: number
  language: Language
  distanceUnit: DistanceUnit
  speedUnit: SpeedUnit
  tempUnit: TempUnit
  darkMode: boolean
  autoBackup: boolean
  lastBackupDate?: string // ISO datetime of last auto-backup
  defaultCurrency?: string // e.g. 'EUR', 'USD'
  // NMEA bridge connection
  nmeaEnabled?: boolean
  nmeaBridgeUrl?: string // e.g. 'ws://localhost:3001'
  // NMEA device config – persisted here so it survives bridge restarts
  nmeaDeviceHost?: string
  nmeaDevicePort?: number
  nmeaDeviceProtocol?: 'tcp' | 'udp'
  // Map / Protomaps API
  protomapsApiKey?: string
  updatedAt: string
}

// ── Watch Schedule ────────────────────────────────────────
export interface WatchEntry {
  id?: number
  date: string
  startTime: string
  endTime: string
  watchOfficer: string
  crewMembers: string[]
  notes?: string
  createdAt: string
}

// ── Safety Checklist ──────────────────────────────────────
export interface ChecklistItem {
  id: string
  category: string
  text: string
  completed: boolean
  completedAt?: string
}

export interface SafetyChecklist {
  id?: number
  date: string
  type: 'pre_departure' | 'arrival' | 'storm' | 'night' | 'crew_briefing'
  items: ChecklistItem[]
  notes: string
  createdAt: string
}
