// ── NMEA 0183 sentence parser ─────────────────────────────────────────────────
// Handles the sentences most commonly available via NMEA 2000 gateway devices.

export interface NMEAParsed {
  type: 'position' | 'sog_cog' | 'wind_apparent' | 'wind_true' | 'wind_mwd' | 'baro' | 'depth'
  [key: string]: unknown
}

// Verify XOR checksum:  $<body>*<HH>
function verifyChecksum(sentence: string): boolean {
  const star = sentence.lastIndexOf('*')
  if (star < 0 || star + 3 > sentence.length) return false
  const body = sentence.substring(1, star)
  const expected = sentence.substring(star + 1, star + 3).toUpperCase()
  const calc = body.split('').reduce((xor, c) => xor ^ c.charCodeAt(0), 0)
  return calc.toString(16).toUpperCase().padStart(2, '0') === expected
}

// Convert NMEA lat/lon (DDDMM.MMMM) + hemisphere to signed decimal degrees
function parseLatLon(raw: string, dir: string): number | null {
  if (!raw || !dir) return null
  const dot = raw.indexOf('.')
  if (dot < 2) return null
  const deg = parseFloat(raw.substring(0, dot - 2))
  const min = parseFloat(raw.substring(dot - 2))
  if (isNaN(deg) || isNaN(min)) return null
  const decimal = deg + min / 60
  return (dir === 'S' || dir === 'W') ? -decimal : decimal
}

// Convert speed to knots
function toKnots(value: number, unit: string): number {
  if (unit === 'M') return value * 1.94384 // m/s → kts
  if (unit === 'K') return value * 0.539957 // km/h → kts
  return value // already knots
}

export function parseSentence(raw: string): NMEAParsed | null {
  const line = raw.trim()
  if (!line.startsWith('$')) return null
  if (!verifyChecksum(line)) return null

  const parts = line.split(',')
  // Sentence ID is the 3 characters after the talker ID prefix (e.g. $GPRMC → RMC)
  const id = parts[0].length >= 6 ? parts[0].substring(3) : parts[0].substring(1)
  const code = id.split('*')[0]

  switch (code) {
    case 'RMC': {
      // $xxRMC,hhmmss,A,llll.ll,a,yyyyy.yy,a,sog,cog,ddmmyy,...
      if (parts[2] !== 'A') return null // status must be Active
      const lat = parseLatLon(parts[3], parts[4])
      const lon = parseLatLon(parts[5], parts[6])
      if (lat === null || lon === null) return null
      const sog = parts[7] ? parseFloat(parts[7]) : undefined
      const cog = parts[8] ? parseFloat(parts[8]) : undefined
      return { type: 'position', latitude: lat, longitude: lon, sog, cogTrue: cog }
    }

    case 'GLL': {
      // $xxGLL,llll.ll,a,yyyyy.yy,a,hhmmss,A,...
      if (parts[6] && parts[6] !== 'A') return null
      const lat = parseLatLon(parts[1], parts[2])
      const lon = parseLatLon(parts[3], parts[4])
      if (lat === null || lon === null) return null
      return { type: 'position', latitude: lat, longitude: lon }
    }

    case 'VTG': {
      // $xxVTG,x.x,T,x.x,M,x.x,N,x.x,K,...
      const cogTrue = parts[1] ? parseFloat(parts[1]) : undefined
      const sog = parts[5] ? parseFloat(parts[5]) : undefined // field 5 = knots
      return { type: 'sog_cog', cogTrue, sog }
    }

    case 'MWV': {
      // $xxMWV,angle,R/T,speed,unit,A*hh
      if (parts[5] && parts[5].split('*')[0] !== 'A') return null
      const angle = parts[1] ? parseFloat(parts[1]) : undefined
      const ref = parts[2]
      const rawSpeed = parts[3] ? parseFloat(parts[3]) : undefined
      const unit = parts[4] ?? 'N'
      const speed = rawSpeed !== undefined ? toKnots(rawSpeed, unit) : undefined
      if (ref === 'R') return { type: 'wind_apparent', windApparentAngle: angle, windApparentSpeed: speed }
      if (ref === 'T') return { type: 'wind_true', windTrueAngle: angle, windTrueSpeed: speed }
      return null
    }

    case 'MWD': {
      // $xxMWD,dir_true,T,dir_mag,M,speed_kts,N,speed_ms,M*hh
      const dirTrue = parts[1] ? parseFloat(parts[1]) : undefined
      const speedKts = parts[5] ? parseFloat(parts[5]) : undefined
      return { type: 'wind_mwd', windTrueDirection: dirTrue, windTrueSpeed: speedKts }
    }

    case 'MDA': {
      // $xxMDA,...,baro_bars,B,...,temp_C,C,...
      // Field index 3 = pressure in bars, field 5 = air temp °C
      const baroBar = parts[3] ? parseFloat(parts[3]) : undefined
      const temp = parts[5] ? parseFloat(parts[5]) : undefined
      const baro = baroBar !== undefined && !isNaN(baroBar) ? baroBar * 1000 : undefined // bar → hPa
      if (baro === undefined && temp === undefined) return null
      return { type: 'baro', baroPressureHPa: baro, temperature: temp }
    }

    case 'XDR': {
      // $xxXDR,P,value,B,name*hh  — pressure in bar
      // $xxXDR,C,value,C,name*hh  — temperature
      if (parts[1] === 'P' && parts[3] === 'B') {
        const raw = parts[2] ? parseFloat(parts[2]) : undefined
        if (raw === undefined || isNaN(raw)) return null
        return { type: 'baro', baroPressureHPa: raw * 1000 }
      }
      if (parts[1] === 'C') {
        const temp = parts[2] ? parseFloat(parts[2]) : undefined
        if (temp === undefined || isNaN(temp)) return null
        return { type: 'baro', temperature: temp }
      }
      return null
    }

    case 'DBT': {
      // $xxDBT,feet,f,meters,M,fathoms,F*hh
      const meters = parts[3] ? parseFloat(parts[3]) : undefined
      if (meters === undefined || isNaN(meters)) return null
      return { type: 'depth', depth: meters }
    }

    case 'DPT': {
      // $xxDPT,depth_m,offset_m*hh
      const meters = parts[1] ? parseFloat(parts[1]) : undefined
      if (meters === undefined || isNaN(meters)) return null
      return { type: 'depth', depth: meters }
    }

    default:
      return null
  }
}
