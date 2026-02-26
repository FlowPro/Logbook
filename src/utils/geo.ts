import type { Coordinate } from '../db/models'

// Haversine formula for distance between two coordinates
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3440.065 // Earth radius in nautical miles
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

// Convert Coordinate object to decimal degrees
export function coordToDecimal(coord: Coordinate): number {
  const decimal = coord.degrees + coord.minutes / 60
  return (coord.direction === 'S' || coord.direction === 'W') ? -decimal : decimal
}

// Convert decimal degrees to Coordinate object
export function decimalToCoord(decimal: number, isLat: boolean): Coordinate {
  const abs = Math.abs(decimal)
  const degrees = Math.floor(abs)
  const minutes = (abs - degrees) * 60
  let direction: 'N' | 'S' | 'E' | 'W'
  if (isLat) {
    direction = decimal >= 0 ? 'N' : 'S'
  } else {
    direction = decimal >= 0 ? 'E' : 'W'
  }
  return { degrees, minutes: parseFloat(minutes.toFixed(3)), direction }
}

// Format coordinate for display (e.g., "48°12.345'N")
export function formatCoordinate(coord: Coordinate): string {
  if (!coord) return '—'
  const minStr = coord.minutes.toFixed(3).padStart(6, '0')
  return `${coord.degrees}°${minStr}'${coord.direction}`
}

// Format for PDF/print
export function formatCoordinateLong(coord: Coordinate): string {
  const minStr = coord.minutes.toFixed(3)
  return `${coord.degrees}° ${minStr}' ${coord.direction}`
}

// Parse GPS coordinates from browser geolocation
export function gpsToCoordinates(position: GeolocationPosition): {
  latitude: Coordinate
  longitude: Coordinate
} {
  return {
    latitude: decimalToCoord(position.coords.latitude, true),
    longitude: decimalToCoord(position.coords.longitude, false),
  }
}

// Calculate bearing between two points
export function calculateBearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLon = toRad(lon2 - lon1)
  const y = Math.sin(dLon) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon)
  const bearing = Math.atan2(y, x) * (180 / Math.PI)
  return (bearing + 360) % 360
}
