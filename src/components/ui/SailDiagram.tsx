import type { MainsailState, GenoaState, StaysailState, LightSailType, HeadsailType } from '../../db/models'

interface SailDiagramProps {
  mainsailState?: MainsailState
  genoa?: GenoaState
  staysail?: StaysailState
  lightSail?: LightSailType
  /** @deprecated use genoa + staysail */
  headsail?: HeadsailType
  size?: number
  className?: string
}

// ── Coordinate lookups ────────────────────────────────────────────────────────
// ViewBox "0 0 82 80". Boat faces RIGHT (bow = right side, stern = left).
// Mast at x=42. Masthead y=6. Mast base y=62. Boom goes AFT to (8,66).
// Bow at x=64, extended with forward-pointing arrowhead to x=74.

// Mainsail: AFT triangle — head slides down with each reef.
// Points: masthead → mast base → boom end (aft)
const MAIN_TOP: Record<MainsailState, number | null> = {
  none: null, full: 6, reef1: 19, reef2: 31, reef3: 42, reef4: 52,
}

// Genoa: large overlapping headsail. Head near masthead, tack at bow, clew aft past mast.
const GENOA_PTS: Record<GenoaState, string | null> = {
  none:  null,
  full:  '42,8 64,62 34,65',
  reef1: '42,19 61,62 38,64',
  reef2: '42,31 58,62 43,63',
  reef3: '42,44 54,62 47,62',
}

// Staysail: inner forestay sail, smaller than genoa.
// Head ~1/3 up the mast (y≈28), tack on inner stay forward, clew near mast.
const STAY_PTS: Record<StaysailState, string | null> = {
  none:  null,
  full:  '42,28 56,62 44,65',
  reef1: '42,36 53,62 46,64',
  reef2: '42,44 50,62 47,63',
  reef3: '42,52 46,62 46,62',
}

// Legacy headsail → map to genoa / staysail points
function legacyHeadsailPts(h: HeadsailType): { genoa?: string; staysail?: string } {
  if (h === 'genoa')    return { genoa: GENOA_PTS.full ?? undefined }
  if (h === 'foresail') return { staysail: STAY_PTS.full ?? undefined }
  return {}
}

/**
 * Side-profile SVG of a sloop. Boat faces RIGHT (bow = right).
 * Mast at x=42. Boom goes AFT (left) to x=8.
 * Rendering order (SVG: last = on top):
 *   1. Mainsail  – aft triangle, drawn first (behind headsails)
 *   2. Genoa     – outer headsail, drawn second
 *   3. Staysail  – inner headsail, drawn third (in front of genoa)
 *   4. Light sail – foremost, drawn last
 */
export function SailDiagram({
  mainsailState = 'none',
  genoa = 'none',
  staysail = 'none',
  lightSail = 'none',
  headsail,
  size = 60,
  className = '',
}: SailDiagramProps) {
  const mainTop = MAIN_TOP[mainsailState]

  // Resolve legacy headsail prop
  let genoaPts  = GENOA_PTS[genoa]
  let stayPts   = STAY_PTS[staysail]
  if (!genoaPts && !stayPts && headsail && headsail !== 'none') {
    const legacy = legacyHeadsailPts(headsail)
    if (legacy.genoa)    genoaPts = legacy.genoa
    if (legacy.staysail) stayPts  = legacy.staysail
  }

  const h = Math.round(size * 80 / 82)

  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 82 80"
      className={`inline-block ${className}`}
      aria-hidden="true"
    >
      {/* ── Hull ─────────────────────────────────────────────── */}
      {/* Main hull silhouette (closed polygon):
           stern deck (9,58) → sheer arc → bow deck (62,53) → bow tip (70,60) →
           bow foot (62,68) → bottom arc → stern bottom (9,68) → stern transom Z  */}
      <path
        d="M9,58 Q35,56 62,53 L70,60 L62,68 Q35,70 9,68 Z"
        fill="rgba(229,231,235,0.7)"
        stroke="#9ca3af"
        strokeWidth="0.7"
      />
      {/* Fin keel (distinguishing sailing-boat feature) */}
      <polygon
        points="33,68 37,76 43,68"
        fill="rgba(209,213,219,0.8)"
        stroke="#9ca3af"
        strokeWidth="0.6"
      />
      {/* Stern transom — emphasized vertical line */}
      <line x1="9" y1="58" x2="9" y2="68" stroke="#4b5563" strokeWidth="1.8" />
      {/* Bow rake — emphasized diagonal forward line */}
      <line x1="62" y1="53" x2="70" y2="60" stroke="#4b5563" strokeWidth="1.4" />
      {/* Waterline — dashed horizontal reference */}
      <path
        d="M9,63 Q35,63 62,62"
        fill="none" stroke="#9ca3af" strokeWidth="0.6" strokeDasharray="3,2"
      />

      {/* ── Mast & boom ──────────────────────────────────────── */}
      {/* Mast at x=42 (roughly 40% from bow) */}
      <line x1="42" y1="6" x2="42" y2="62" stroke="#374151" strokeWidth="1.1" />
      {/* Boom goes AFT toward stern */}
      <line x1="42" y1="62" x2="8" y2="66" stroke="#374151" strokeWidth="0.9" />

      {/* ── 1. Mainsail (aft – drawn first = behind) ────────── */}
      {mainTop !== null && (
        <polygon
          points={`42,${mainTop} 42,62 8,66`}
          fill="rgba(37,99,235,0.62)"
          stroke="#1d4ed8"
          strokeWidth="0.8"
        />
      )}

      {/* ── 2. Genoa (outer headsail) ────────────────────────── */}
      {genoaPts && (
        <polygon
          points={genoaPts}
          fill="rgba(59,130,246,0.28)"
          stroke="#3b82f6"
          strokeWidth="0.8"
        />
      )}

      {/* ── 3. Staysail (inner headsail, in front of genoa) ─── */}
      {stayPts && (
        <polygon
          points={stayPts}
          fill="rgba(96,165,250,0.48)"
          stroke="#60a5fa"
          strokeWidth="0.8"
        />
      )}

      {/* ── 4. Light sail (foremost, beyond bow) ─────────────── */}
      {lightSail === 'code0' && (
        <polygon
          points="42,9 75,55 64,63"
          fill="rgba(124,58,237,0.38)"
          stroke="#7c3aed"
          strokeWidth="0.8"
        />
      )}
      {lightSail === 'gennaker' && (
        <polygon
          points="40,7 77,44 64,63"
          fill="rgba(139,92,246,0.38)"
          stroke="#8b5cf6"
          strokeWidth="0.8"
        />
      )}
      {lightSail === 'parasail' && (
        <polygon
          points="38,5 77,38 64,63"
          fill="rgba(249,115,22,0.44)"
          stroke="#f97316"
          strokeWidth="0.8"
        />
      )}
    </svg>
  )
}
