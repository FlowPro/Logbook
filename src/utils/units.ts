import type { DistanceUnit, SpeedUnit, TempUnit } from '../db/models'

// Distance conversions
export function nmToKm(nm: number): number { return nm * 1.852 }
export function kmToNm(km: number): number { return km / 1.852 }

export function formatDistance(nm: number, unit: DistanceUnit): string {
  if (unit === 'km') return `${nmToKm(nm).toFixed(1)} km`
  return `${nm.toFixed(1)} nm`
}

// Speed conversions
export function ktsToKmh(kts: number): number { return kts * 1.852 }
export function ktsToMs(kts: number): number { return kts * 0.514444 }
export function kmhToKts(kmh: number): number { return kmh / 1.852 }

export function formatSpeed(kts: number, unit: SpeedUnit): string {
  switch (unit) {
    case 'kmh': return `${ktsToKmh(kts).toFixed(1)} km/h`
    case 'ms': return `${ktsToMs(kts).toFixed(1)} m/s`
    default: return `${kts.toFixed(1)} kts`
  }
}

// Temperature conversions
export function celsiusToFahrenheit(c: number): number { return (c * 9/5) + 32 }
export function fahrenheitToCelsius(f: number): number { return (f - 32) * 5/9 }

export function formatTemperature(celsius: number, unit: TempUnit): string {
  if (unit === 'fahrenheit') return `${celsiusToFahrenheit(celsius).toFixed(1)}°F`
  return `${celsius.toFixed(1)}°C`
}

// Beaufort scale
export const BEAUFORT_DATA: Array<{
  force: number
  minKts: number
  maxKts: number
  colorClass: string
}> = [
  { force: 0, minKts: 0, maxKts: 1, colorClass: 'beaufort-0' },
  { force: 1, minKts: 1, maxKts: 3, colorClass: 'beaufort-1' },
  { force: 2, minKts: 4, maxKts: 6, colorClass: 'beaufort-2' },
  { force: 3, minKts: 7, maxKts: 10, colorClass: 'beaufort-3' },
  { force: 4, minKts: 11, maxKts: 16, colorClass: 'beaufort-4' },
  { force: 5, minKts: 17, maxKts: 21, colorClass: 'beaufort-5' },
  { force: 6, minKts: 22, maxKts: 27, colorClass: 'beaufort-6' },
  { force: 7, minKts: 28, maxKts: 33, colorClass: 'beaufort-7' },
  { force: 8, minKts: 34, maxKts: 40, colorClass: 'beaufort-8' },
  { force: 9, minKts: 41, maxKts: 47, colorClass: 'beaufort-9' },
  { force: 10, minKts: 48, maxKts: 55, colorClass: 'beaufort-10' },
  { force: 11, minKts: 56, maxKts: 63, colorClass: 'beaufort-11' },
  { force: 12, minKts: 64, maxKts: 999, colorClass: 'beaufort-12' },
]

export function ktsToBeaufort(kts: number): number {
  const entry = BEAUFORT_DATA.find(b => kts >= b.minKts && kts <= b.maxKts)
  return entry?.force ?? 12
}

export function beaufortToMaxKts(force: number): number {
  return BEAUFORT_DATA[force]?.maxKts ?? 64
}

export function beaufortColorClass(force: number): string {
  return BEAUFORT_DATA[force]?.colorClass ?? 'beaufort-12'
}

// Format heading/course
export function formatHeading(degrees: number): string {
  return `${Math.round(degrees).toString().padStart(3, '0')}°`
}

// Format duration in hours to h:mm
export function formatDuration(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

// Format number with Swiss apostrophe thousands separator (e.g. 1'234.5)
export function fmtNum(n: number, decimals = 0): string {
  const fixed = n.toFixed(decimals)
  const [intPart, decPart] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  return decPart !== undefined ? `${grouped}.${decPart}` : grouped
}
