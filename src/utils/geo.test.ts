import { describe, it, expect } from 'vitest'
import {
  haversineDistance,
  coordToDecimal,
  decimalToCoord,
  formatCoordinate,
  calculateBearing,
} from './geo'
import type { Coordinate } from '../db/models'

describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance(47.5, 9.0, 47.5, 9.0)).toBe(0)
  })

  it('calculates distance between Konstanz and Zürich (~31 nm)', () => {
    // Konstanz: 47.664, 9.175 — Zürich: 47.376, 8.541
    const nm = haversineDistance(47.664, 9.175, 47.376, 8.541)
    expect(nm).toBeGreaterThan(29)
    expect(nm).toBeLessThan(33)
  })

  it('calculates transatlantic distance (~1796 nm Horta–Bermuda)', () => {
    // Horta (Azores): 38.53, -28.62 — Bermuda: 32.3, -64.78
    const nm = haversineDistance(38.53, -28.62, 32.3, -64.78)
    expect(nm).toBeGreaterThan(1780)
    expect(nm).toBeLessThan(1820)
  })
})

describe('coordToDecimal', () => {
  it('converts N coordinate to positive decimal', () => {
    const coord: Coordinate = { degrees: 47, minutes: 30, direction: 'N' }
    expect(coordToDecimal(coord)).toBeCloseTo(47.5, 5)
  })

  it('converts S coordinate to negative decimal', () => {
    const coord: Coordinate = { degrees: 33, minutes: 52.2, direction: 'S' }
    expect(coordToDecimal(coord)).toBeLessThan(0)
    expect(coordToDecimal(coord)).toBeCloseTo(-33.87, 2)
  })

  it('converts E coordinate to positive decimal', () => {
    const coord: Coordinate = { degrees: 9, minutes: 10.5, direction: 'E' }
    expect(coordToDecimal(coord)).toBeCloseTo(9.175, 2)
  })

  it('converts W coordinate to negative decimal', () => {
    const coord: Coordinate = { degrees: 64, minutes: 46.8, direction: 'W' }
    expect(coordToDecimal(coord)).toBeCloseTo(-64.78, 2)
  })
})

describe('decimalToCoord', () => {
  it('converts positive decimal to N latitude', () => {
    const coord = decimalToCoord(47.5, true)
    expect(coord.direction).toBe('N')
    expect(coord.degrees).toBe(47)
    expect(coord.minutes).toBeCloseTo(30, 2)
  })

  it('converts negative decimal to S latitude', () => {
    const coord = decimalToCoord(-33.87, true)
    expect(coord.direction).toBe('S')
    expect(coord.degrees).toBe(33)
  })

  it('converts positive decimal to E longitude', () => {
    const coord = decimalToCoord(9.0, false)
    expect(coord.direction).toBe('E')
    expect(coord.degrees).toBe(9)
    expect(coord.minutes).toBeCloseTo(0, 3)
  })

  it('converts negative decimal to W longitude', () => {
    const coord = decimalToCoord(-64.78, false)
    expect(coord.direction).toBe('W')
    expect(coord.degrees).toBe(64)
  })

  it('round-trips coordToDecimal → decimalToCoord', () => {
    const original: Coordinate = { degrees: 51, minutes: 30.5, direction: 'N' }
    const decimal = coordToDecimal(original)
    const back = decimalToCoord(decimal, true)
    expect(back.degrees).toBe(original.degrees)
    expect(back.minutes).toBeCloseTo(original.minutes, 1)
    expect(back.direction).toBe(original.direction)
  })
})

describe('formatCoordinate', () => {
  it('formats N coordinate correctly', () => {
    const coord: Coordinate = { degrees: 47, minutes: 30.0, direction: 'N' }
    expect(formatCoordinate(coord)).toBe("47°30.000'N")
  })

  it('pads minutes to 6 characters', () => {
    const coord: Coordinate = { degrees: 9, minutes: 5.5, direction: 'E' }
    const result = formatCoordinate(coord)
    // minutes part "05.500" → 6 chars
    expect(result).toBe("9°05.500'E")
  })

  it('returns em-dash for falsy coordinate', () => {
    expect(formatCoordinate(null as unknown as Coordinate)).toBe('—')
  })
})

describe('calculateBearing', () => {
  it('returns ~0° bearing heading north', () => {
    const bearing = calculateBearing(47.0, 9.0, 48.0, 9.0)
    expect(bearing).toBeCloseTo(0, 0)
  })

  it('returns ~90° bearing heading east', () => {
    const bearing = calculateBearing(47.0, 9.0, 47.0, 10.0)
    expect(bearing).toBeCloseTo(90, 0)
  })

  it('returns ~180° bearing heading south', () => {
    const bearing = calculateBearing(48.0, 9.0, 47.0, 9.0)
    expect(bearing).toBeCloseTo(180, 0)
  })

  it('returns ~270° bearing heading west', () => {
    const bearing = calculateBearing(47.0, 10.0, 47.0, 9.0)
    expect(bearing).toBeCloseTo(270, 0)
  })

  it('result is always in range [0, 360)', () => {
    const b = calculateBearing(0, 0, -1, -1)
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThan(360)
  })
})
