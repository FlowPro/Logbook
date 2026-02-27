import { describe, it, expect } from 'vitest'
import {
  nmToKm,
  kmToNm,
  formatDistance,
  ktsToKmh,
  ktsToMs,
  kmhToKts,
  formatSpeed,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  formatTemperature,
  ktsToBeaufort,
  beaufortToMaxKts,
  formatHeading,
  formatDuration,
  fmtNum,
} from './units'

describe('distance conversions', () => {
  it('converts 1 nm to 1.852 km', () => {
    expect(nmToKm(1)).toBeCloseTo(1.852, 3)
  })

  it('converts 1.852 km to 1 nm', () => {
    expect(kmToNm(1.852)).toBeCloseTo(1, 3)
  })

  it('round-trips nm → km → nm', () => {
    expect(kmToNm(nmToKm(100))).toBeCloseTo(100, 5)
  })

  it('formatDistance returns nm string', () => {
    expect(formatDistance(10, 'nm')).toBe('10.0 nm')
  })

  it('formatDistance converts to km', () => {
    expect(formatDistance(1, 'km')).toBe('1.9 km')
  })
})

describe('speed conversions', () => {
  it('converts 1 kts to 1.852 km/h', () => {
    expect(ktsToKmh(1)).toBeCloseTo(1.852, 3)
  })

  it('converts 1 kts to 0.5144 m/s', () => {
    expect(ktsToMs(1)).toBeCloseTo(0.5144, 3)
  })

  it('round-trips kts → kmh → kts', () => {
    expect(kmhToKts(ktsToKmh(10))).toBeCloseTo(10, 5)
  })

  it('formatSpeed returns kts string', () => {
    expect(formatSpeed(5.5, 'kts')).toBe('5.5 kts')
  })

  it('formatSpeed converts to km/h', () => {
    expect(formatSpeed(1, 'kmh')).toBe('1.9 km/h')
  })

  it('formatSpeed converts to m/s', () => {
    expect(formatSpeed(1, 'ms')).toBe('0.5 m/s')
  })
})

describe('temperature conversions', () => {
  it('converts 0°C to 32°F', () => {
    expect(celsiusToFahrenheit(0)).toBe(32)
  })

  it('converts 100°C to 212°F', () => {
    expect(celsiusToFahrenheit(100)).toBe(212)
  })

  it('converts 32°F to 0°C', () => {
    expect(fahrenheitToCelsius(32)).toBeCloseTo(0, 5)
  })

  it('round-trips celsius → fahrenheit → celsius', () => {
    expect(fahrenheitToCelsius(celsiusToFahrenheit(20))).toBeCloseTo(20, 5)
  })

  it('formatTemperature returns °C string', () => {
    expect(formatTemperature(20, 'celsius')).toBe('20.0°C')
  })

  it('formatTemperature converts to °F', () => {
    expect(formatTemperature(0, 'fahrenheit')).toBe('32.0°F')
  })
})

describe('ktsToBeaufort', () => {
  it('returns BFT 0 for 0 kts (calm)', () => {
    expect(ktsToBeaufort(0)).toBe(0)
  })

  it('returns BFT 4 for 13 kts', () => {
    expect(ktsToBeaufort(13)).toBe(4)
  })

  it('returns BFT 6 for 25 kts', () => {
    expect(ktsToBeaufort(25)).toBe(6)
  })

  it('returns BFT 12 for 70 kts (hurricane)', () => {
    expect(ktsToBeaufort(70)).toBe(12)
  })

  it('beaufortToMaxKts returns correct upper limit', () => {
    expect(beaufortToMaxKts(6)).toBe(27)
  })
})

describe('formatHeading', () => {
  it('pads single-digit degrees to 3 chars', () => {
    expect(formatHeading(5)).toBe('005°')
  })

  it('pads double-digit degrees to 3 chars', () => {
    expect(formatHeading(90)).toBe('090°')
  })

  it('formats 360 correctly', () => {
    expect(formatHeading(360)).toBe('360°')
  })

  it('rounds fractional degrees', () => {
    expect(formatHeading(45.7)).toBe('046°')
  })
})

describe('formatDuration', () => {
  it('formats whole hours', () => {
    expect(formatDuration(2)).toBe('2:00')
  })

  it('formats hours with minutes', () => {
    expect(formatDuration(2.5)).toBe('2:30')
  })

  it('pads minutes to 2 digits', () => {
    expect(formatDuration(1 + 5 / 60)).toBe('1:05')
  })
})

describe('fmtNum', () => {
  it('formats integers without separator', () => {
    expect(fmtNum(999)).toBe('999')
  })

  it('uses Swiss apostrophe for thousands', () => {
    expect(fmtNum(1234)).toBe("1'234")
  })

  it('formats with decimals', () => {
    expect(fmtNum(1234.5, 1)).toBe("1'234.5")
  })

  it('handles zero', () => {
    expect(fmtNum(0)).toBe('0')
  })
})
