import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { layers, namedFlavor } from '@protomaps/basemaps'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { Wind, Layers, Download, X } from 'lucide-react'
import { db } from '../db/database'
import { useSettings } from '../hooks/useSettings'
import type { Coordinate } from '../db/models'

// ── Tile sources ───────────────────────────────────────────────────────────────

// Fallback styles when no Protomaps API key is configured
const FALLBACK_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark:  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
} as const

// Build a full MapLibre GL style from the Protomaps API key + flavor
function makeProtomapsStyle(apiKey: string, flavor: 'light' | 'dark') {
  return {
    version: 8 as const,
    glyphs:  'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite:  `https://protomaps.github.io/basemaps-assets/sprites/v4/${flavor}`,
    sources: {
      protomaps: {
        type: 'vector' as const,
        tiles: [`https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=${apiKey}`],
        maxzoom: 15,
        attribution:
          '© <a href="https://protomaps.com">Protomaps</a> ' +
          '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers('protomaps', namedFlavor(flavor)),
  }
}

// ── Offline pre-cache ──────────────────────────────────────────────────────────

/** Total number of tiles from z=0 to z=maxZoom */
function tileCount(maxZoom: number) {
  let n = 0
  for (let z = 0; z <= maxZoom; z++) n += (2 ** z) ** 2
  return n
}

const PRECACHE_NAME = 'protomaps-tiles-precache'

/** Pre-fetch every tile for z=0..maxZoom and write directly into CacheStorage */
async function precacheTiles(
  apiKey: string,
  maxZoom: number,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
) {
  const cache = 'caches' in window ? await caches.open(PRECACHE_NAME) : null
  const total = tileCount(maxZoom)
  let done = 0
  const BATCH = 20

  for (let z = 0; z <= maxZoom && !signal.aborted; z++) {
    const n = 2 ** z
    const coords: [number, number][] = []
    for (let x = 0; x < n; x++)
      for (let y = 0; y < n; y++)
        coords.push([x, y])

    for (let i = 0; i < coords.length && !signal.aborted; i += BATCH) {
      const batch = coords.slice(i, i + BATCH)
      await Promise.allSettled(
        batch.map(async ([x, y]) => {
          const url = `https://api.protomaps.com/tiles/v4/${z}/${x}/${y}.mvt?key=${apiKey}`
          try {
            const res = await fetch(url, { signal })
            if (res.ok && cache) await cache.put(url, res)
          } catch { /* aborted or network error */ }
        })
      )
      done += batch.length
      onProgress(done, total)
    }
  }
}

// ── Mooring display ───────────────────────────────────────────────────────────
const MOORING_ICON: Record<string, string> = {
  anchored:         '⚓',
  moored_marina:    '⊞',
  moored_buoy:      '◎',
  moored_alongside: '⊟',
}
const MOORING_COLOR: Record<string, string> = {
  anchored:         '#14b8a6',
  moored_marina:    '#0d9488',
  moored_buoy:      '#0891b2',
  moored_alongside: '#0e7490',
}
const MOORING_LABEL: Record<string, string> = {
  underway:         'Unterwegs',
  anchored:         'Vor Anker',
  moored_marina:    'Hafen / Marina',
  moored_buoy:      'Boje',
  moored_alongside: 'Längsseits',
}

// ── Beaufort color expression ─────────────────────────────────────────────────
const BFT_COLOR_EXPR = [
  'step', ['get', 'bft'],
  '#94a3b8', 1,'#86efac', 2,'#4ade80', 3,'#22c55e',
  4,'#fbbf24', 5,'#f59e0b', 6,'#f97316', 7,'#ea580c',
  8,'#ef4444', 9,'#dc2626', 10,'#991b1b', 11,'#7f1d1d',
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDecimal(c: Coordinate): number {
  const d = c.degrees + c.minutes / 60
  return c.direction === 'S' || c.direction === 'W' ? -d : d
}

type FilterMode = 'all' | 'passage' | 'year'

interface MapData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  routeFeatures: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pointFeatures: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  windFeatures:  any[]
  bounds: [[number, number], [number, number]]
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MapView() {
  const { t } = useTranslation()
  const { settings } = useSettings()
  const location         = useLocation()
  const mapContainerRef  = useRef<HTMLDivElement>(null)
  const mapRef           = useRef<maplibregl.Map | null>(null)
  const dataRef          = useRef<MapData | null>(null)
  const cacheAbortRef    = useRef<AbortController | null>(null)
  const shipMarkerRef    = useRef<maplibregl.Marker | null>(null)
  // Save viewport before map recreation so center/zoom survive dark/light switch
  const savedCenterRef   = useRef<[number, number] | null>(null)
  const savedZoomRef     = useRef<number | null>(null)
  const [mapReady, setMapReady] = useState(false)

  const [filterMode,        setFilterMode]        = useState<FilterMode>('all')
  const [selectedPassageId, setSelectedPassageId] = useState<number | null>(null)
  const [selectedYear,      setSelectedYear]       = useState<number>(new Date().getFullYear())
  const [showWind,          setShowWind]           = useState(true)

  // Offline pre-cache state
  const [cacheState,    setCacheState]    = useState<'idle' | 'running' | 'done'>('idle')
  const [cacheProgress, setCacheProgress] = useState(0) // 0-100

  const settingsLoaded = settings !== undefined

  // Mirror the same dark-mode logic used by AppLayout / Header.
  // The Header writes `themeMode` (system/light/dark/night), NOT the legacy `darkMode` boolean.
  const [prefersDark, setPrefersDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setPrefersDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const themeMode    = settings?.themeMode ?? (settings?.darkMode ? 'dark' : 'system')
  const isDark       = themeMode === 'dark' || themeMode === 'night' || (themeMode === 'system' && prefersDark)
  const desiredStyle = isDark ? 'dark' : 'light'

  const apiKey         = settings?.protomapsApiKey?.trim() ?? ''
  const hasApiKey      = apiKey.length > 0

  // Check our own precache to determine button visibility
  useEffect(() => {
    if (!hasApiKey || !('caches' in window)) return
    caches.open(PRECACHE_NAME)
      .then(cache => cache.keys())
      .then(keys => setCacheState(keys.length > 0 ? 'done' : 'idle'))
      .catch(() => {})
  }, [hasApiKey])

  // Resolve the style: Protomaps if API key set, else fallback
  const resolveStyle = useCallback((flavor: 'light' | 'dark') =>
    hasApiKey ? makeProtomapsStyle(apiKey, flavor) : FALLBACK_STYLES[flavor],
  [hasApiKey, apiKey])

  // ── Data ─────────────────────────────────────────────────────────────────────

  const passages = useLiveQuery(() =>
    db.passages.orderBy('departureDate').reverse().toArray()
  )

  const availableYears = useMemo(() => {
    if (!passages) return [new Date().getFullYear()]
    const ys = new Set(passages.map(p => parseInt(p.departureDate.slice(0, 4))))
    return [...ys].sort((a, b) => b - a)
  }, [passages])

  // Last log entry overall — always global, used for ship position marker
  const lastEntry = useLiveQuery(() =>
    db.logEntries.orderBy('[date+time]').last()
  )

  const entries = useLiveQuery(async () => {
    if (filterMode === 'passage' && selectedPassageId != null) {
      const all = await db.logEntries.where('passageId').equals(selectedPassageId).toArray()
      return all.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    }
    if (filterMode === 'year') {
      const all = await db.logEntries
        .where('date').between(`${selectedYear}-01-01`, `${selectedYear}-12-31`, true, true)
        .toArray()
      return all.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    }
    const all = await db.logEntries.toArray()
    return all.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  }, [filterMode, selectedPassageId, selectedYear])

  // ── GeoJSON ──────────────────────────────────────────────────────────────────

  const geojson = useMemo((): MapData | null => {
    if (!entries || entries.length === 0) return null

    const valid = entries.filter(e =>
      e.latitude?.degrees != null && e.longitude?.degrees != null
    )
    if (valid.length === 0) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routeFeatures: any[] = []
    for (let i = 0; i < valid.length - 1; i++) {
      const a = valid[i], b = valid[i + 1]
      if (a.passageId !== b.passageId) continue
      routeFeatures.push({
        type: 'Feature',
        properties: { motor: a.engineOn ? 1 : 0 },
        geometry: {
          type: 'LineString',
          coordinates: [
            [toDecimal(a.longitude), toDecimal(a.latitude)],
            [toDecimal(b.longitude), toDecimal(b.latitude)],
          ],
        },
      })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pointFeatures: any[] = valid.map(e => ({
      type: 'Feature',
      properties: {
        passageId: e.passageId ?? null,
        motor:   e.engineOn ? 1 : 0,
        bft:     e.windBeaufort ?? 0,
        windDir: e.windTrueDirection ?? null,
        windSpd: e.windTrueSpeed ?? 0,
        sog:     e.speedOverGround ?? 0,
        date:    e.date,
        time:    e.time,
        mooring: e.mooringStatus ?? 'underway',
        notes:   e.notes?.slice(0, 140) ?? '',
      },
      geometry: {
        type: 'Point',
        coordinates: [toDecimal(e.longitude), toDecimal(e.latitude)],
      },
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const windFeatures: any[] = valid
      .filter(e => e.windTrueDirection != null)
      .map(e => ({
        type: 'Feature',
        properties: { bft: e.windBeaufort ?? 0, windDir: e.windTrueDirection! },
        geometry: {
          type: 'Point',
          coordinates: [toDecimal(e.longitude), toDecimal(e.latitude)],
        },
      }))

    const lons = valid.map(e => toDecimal(e.longitude))
    const lats = valid.map(e => toDecimal(e.latitude))
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lons) - 0.5, Math.min(...lats) - 0.5],
      [Math.max(...lons) + 0.5, Math.max(...lats) + 0.5],
    ]

    return { routeFeatures, pointFeatures, windFeatures, bounds }
  }, [entries])

  useEffect(() => { dataRef.current = geojson }, [geojson])

  // ── Layer setup ───────────────────────────────────────────────────────────────

  const setupLayers = useCallback((map: maplibregl.Map) => {
    // Defensive: remove stale custom layers/sources in case the style diff
    // left them behind (MapLibre diff mode may not remove user-added sources)
    for (const id of ['route-sail', 'route-motor', 'wind-arrows', 'entry-dots', 'mooring-dots']) {
      try { if (map.getLayer(id)) map.removeLayer(id) } catch { /* ignore */ }
    }
    for (const id of ['route', 'wind', 'points']) {
      try { if (map.getSource(id)) map.removeSource(id) } catch { /* ignore */ }
    }

    map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'route-sail', type: 'line', source: 'route',
      filter: ['==', ['get', 'motor'], 0],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#3b82f6', 'line-width': 3, 'line-opacity': 0.85 },
    })
    map.addLayer({
      id: 'route-motor', type: 'line', source: 'route',
      filter: ['==', ['get', 'motor'], 1],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#f97316', 'line-width': 3, 'line-opacity': 0.85 },
    })

    map.addSource('wind', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

    map.addSource('points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

    map.addLayer({
      id: 'entry-dots', type: 'circle', source: 'points',
      filter: ['==', ['get', 'mooring'], 'underway'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 10, 5],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'circle-color': ['match', ['get', 'motor'], 1, '#f97316', '#3b82f6'] as any,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.2,
        'circle-opacity': 0.9,
      },
    })

    map.addLayer({
      id: 'mooring-dots', type: 'circle', source: 'points',
      filter: ['!=', ['get', 'mooring'], 'underway'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 6, 10, 10],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'circle-color': ['match', ['get', 'mooring'],
          'anchored',         MOORING_COLOR.anchored,
          'moored_marina',    MOORING_COLOR.moored_marina,
          'moored_buoy',      MOORING_COLOR.moored_buoy,
          'moored_alongside', MOORING_COLOR.moored_alongside,
          '#94a3b8',
        ] as any,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-opacity': 0.95,
      },
    })

    // Wind arrows rendered on top of dots.
    // text-anchor:'left' = the coordinate (dot center) is at the LEFT (tail) of the arrow,
    // so the arrow extends FROM the dot in the wind direction — like a weather barb.
    map.addLayer({
      id: 'wind-arrows', type: 'symbol', source: 'wind', minzoom: 3,
      layout: {
        'text-field': '→',
        'text-font': ['Noto Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 12, 6, 16, 10, 22],
        'text-rotate': ['-', ['get', 'windDir'], 90],
        'text-rotation-alignment': 'map',
        'text-anchor': 'left',
        'text-offset': ['literal', [0.4, 0]],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paint: { 'text-color': BFT_COLOR_EXPR as any, 'text-halo-color': 'rgba(0,0,0,0.6)', 'text-halo-width': 1.5 },
    })

    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '268px' })

    const showPopup = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const f = e.features?.[0]
      if (!f) return
      const p = f.properties as {
        date: string; time: string; sog: number; motor: number
        bft: number; windSpd: number; windDir: number | null
        mooring: string; notes: string
      }
      const isUnderway = p.mooring === 'underway'
      const moorIcon   = MOORING_ICON[p.mooring]  ?? ''
      const moorLabel  = MOORING_LABEL[p.mooring] ?? p.mooring
      const windStr    = p.windDir != null
        ? `${p.bft} Bft · ${p.windSpd.toFixed(1)} kn aus ${Math.round(p.windDir)}°`
        : `${p.bft} Bft · ${p.windSpd.toFixed(1)} kn`

      const statusHtml = isUnderway
        ? `<div style="color:#374151">${p.motor ? '⚙ Motor' : '⛵ Segel'} · SOG ${p.sog.toFixed(1)} kn</div>`
        : `<div style="color:#0d9488">${moorIcon} ${moorLabel}</div>`

      popup.setLngLat(e.lngLat).setHTML(`
        <div style="font-size:12px;line-height:1.75;color:#111827;padding:2px 0">
          <div style="font-weight:700;margin-bottom:4px;color:#111827">${p.date} · ${p.time} UTC</div>
          ${statusHtml}
          <div style="color:#d97706">💨 ${windStr}</div>
          ${p.notes
            ? `<div style="margin-top:5px;color:#6b7280;font-size:11px;border-top:1px solid #e5e7eb;padding-top:4px">${p.notes}</div>`
            : ''}
        </div>
      `).addTo(map)
    }

    const CLICKABLE = ['entry-dots', 'mooring-dots'] as const
    CLICKABLE.forEach(id => {
      map.on('click',      id, showPopup)
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = '' })
    })
  }, [])

  const fillSources = useCallback((map: maplibregl.Map, data: MapData | null) => {
    const empty = { type: 'FeatureCollection' as const, features: [] }
    ;(map.getSource('route')  as maplibregl.GeoJSONSource | undefined)?.setData(
      data ? { type: 'FeatureCollection', features: data.routeFeatures } : empty
    )
    ;(map.getSource('points') as maplibregl.GeoJSONSource | undefined)?.setData(
      data ? { type: 'FeatureCollection', features: data.pointFeatures } : empty
    )
    ;(map.getSource('wind')   as maplibregl.GeoJSONSource | undefined)?.setData(
      data ? { type: 'FeatureCollection', features: data.windFeatures } : empty
    )
    if (data) {
      const [[w, s], [e, n]] = data.bounds
      if (w !== e || s !== n) map.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 13, duration: 800 })
    }
  }, [])

  // ── Map initialisation ────────────────────────────────────────────────────────
  // desiredStyle / hasApiKey / apiKey are direct deps so React recreates the map
  // whenever dark/light mode or the Protomaps key changes — no setStyle() needed.

  useEffect(() => {
    if (!mapContainerRef.current || !settingsLoaded) return

    const pmtilesProtocol = new Protocol()
    maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const style = (hasApiKey ? makeProtomapsStyle(apiKey, desiredStyle) : FALLBACK_STYLES[desiredStyle]) as any

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: savedCenterRef.current ?? [10, 48],
      zoom:   savedZoomRef.current   ?? 4,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'nautical' }), 'bottom-left')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      setupLayers(map)
      fillSources(map, dataRef.current)
      mapRef.current = map
      setMapReady(true)
    })

    return () => {
      // Preserve viewport so the new map starts at the same position
      try {
        savedCenterRef.current = map.getCenter().toArray() as [number, number]
        savedZoomRef.current   = map.getZoom()
      } catch { /* map may already be in invalid state */ }
      maplibregl.removeProtocol('pmtiles')
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [settingsLoaded, desiredStyle, hasApiKey, apiKey, setupLayers, fillSources])

  // ── Update sources when data/filter changes ───────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    fillSources(map, geojson)
  }, [mapReady, geojson, fillSources])

  // ── Wind layer visibility ─────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    map.setLayoutProperty('wind-arrows', 'visibility', showWind ? 'visible' : 'none')
  }, [mapReady, showWind])

  // ── Passage deep-link: fitBounds to specific passage from navigation state ────

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !geojson) return
    const linkPassageId = (location.state as { passageId?: number } | null)?.passageId
    if (!linkPassageId) return
    // Zoom to this passage's entries
    const pts = geojson.pointFeatures.filter(f => f.properties.passageId === linkPassageId)
    if (pts.length === 0) return
    const lons = pts.map((f: { geometry: { coordinates: number[] } }) => f.geometry.coordinates[0])
    const lats = pts.map((f: { geometry: { coordinates: number[] } }) => f.geometry.coordinates[1])
    map.fitBounds(
      [[Math.min(...lons) - 0.5, Math.min(...lats) - 0.5], [Math.max(...lons) + 0.5, Math.max(...lats) + 0.5]],
      { padding: 60, maxZoom: 12, duration: 800 }
    )
    // Clear the state so a refresh doesn't re-trigger
    window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, geojson])

  // ── Ship position marker (last log entry) ─────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    // Remove stale marker first
    shipMarkerRef.current?.remove()
    shipMarkerRef.current = null

    if (!mapReady || !map) return
    if (!lastEntry || lastEntry.latitude?.degrees == null || lastEntry.longitude?.degrees == null) return

    const lng = toDecimal(lastEntry.longitude)
    const lat = toDecimal(lastEntry.latitude)

    const el = document.createElement('div')
    el.className = 'ship-position-marker'
    el.innerHTML = '<div class="ship-pulse-ring"></div><div class="ship-pulse-dot"></div>'

    const mooring    = lastEntry.mooringStatus ?? 'underway'
    const isUnderway = mooring === 'underway'
    const statusLine = isUnderway
      ? `${lastEntry.engineOn ? '⚙ Motor' : '⛵ Segel'} · SOG ${(lastEntry.speedOverGround ?? 0).toFixed(1)} kn`
      : `⚓ ${MOORING_LABEL[mooring] ?? mooring}`

    const popup = new maplibregl.Popup({ offset: 14, closeButton: false, closeOnClick: true })
      .setHTML(`
        <div style="font-size:12px;line-height:1.75;color:#111827;padding:2px 0">
          <div style="font-weight:700;color:#059669;margin-bottom:2px">● Letzte Position</div>
          <div>${lastEntry.date} · ${lastEntry.time} UTC</div>
          <div style="color:#374151">${statusLine}</div>
        </div>
      `)

    shipMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([lng, lat])
      .setPopup(popup)
      .addTo(map)

    return () => {
      shipMarkerRef.current?.remove()
      shipMarkerRef.current = null
    }
  }, [mapReady, lastEntry])

  // ── Offline pre-cache handler ─────────────────────────────────────────────────

  async function handleStartCache() {
    if (!hasApiKey || cacheState === 'running') return
    const ctrl = new AbortController()
    cacheAbortRef.current = ctrl
    setCacheState('running')
    setCacheProgress(0)
    try {
      await precacheTiles(apiKey, 6, (done, total) => {
        setCacheProgress(Math.round((done / total) * 100))
      }, ctrl.signal)
      if (!ctrl.signal.aborted) setCacheState('done')
    } catch {
      // aborted or network error
    } finally {
      if (ctrl.signal.aborted) setCacheState('idle')
    }
  }

  function handleCancelCache() {
    cacheAbortRef.current?.abort()
    setCacheState('idle')
    setCacheProgress(0)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const noData = !entries || entries.filter(e => e.latitude?.degrees != null).length === 0

  return (
    <div className="flex flex-col gap-3" style={{ height: 'calc(100dvh - 56px - 3rem)' }}>

      {/* Filter + controls bar */}
      <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 flex-shrink-0">
        <span className="text-base font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">{t('nav.map')}</span>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

        {/* Left: filter buttons + inline selector */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {(['all', 'passage', 'year'] as FilterMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                filterMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {mode === 'all' ? t('map.filterAll') : mode === 'passage' ? t('map.filterPassage') : t('map.filterYear')}
            </button>
          ))}

          {filterMode === 'passage' && passages && (
            <select
              value={selectedPassageId != null ? String(selectedPassageId) : ''}
              onChange={e => setSelectedPassageId(e.target.value ? Number(e.target.value) : null)}
              className="flex-shrink-0 w-64 px-3 py-[5px] text-sm appearance-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors cursor-pointer"
            >
              <option value="">— {t('summary.selectPassage')} —</option>
              {passages.map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.departurePort} → {p.arrivalPort} ({p.departureDate})
                </option>
              ))}
            </select>
          )}

          {filterMode === 'year' && (
            <select
              value={String(selectedYear)}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="flex-shrink-0 w-28 px-3 py-[5px] text-sm appearance-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors cursor-pointer"
            >
              {availableYears.map(y => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          )}
        </div>

        {/* Right: offline cache + wind toggle + legend */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Offline cache button */}
          {cacheState === 'idle' && (
            <button
              onClick={hasApiKey ? handleStartCache : undefined}
              title={hasApiKey ? t('map.precacheBtn') : t('map.precacheNoKey')}
              disabled={!hasApiKey}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                hasApiKey
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  : 'bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600 cursor-not-allowed'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="max-lg:hidden">{t('map.precacheBtn')}</span>
            </button>
          )}

          {cacheState === 'running' && (
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${cacheProgress}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">{cacheProgress}%</span>
              <button onClick={handleCancelCache} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
                <X className="w-3 h-3 text-gray-400" />
              </button>
            </div>
          )}

          {cacheState === 'done' && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium px-2">
              {t('map.precacheDone')}
            </span>
          )}

          {/* Wind toggle */}
          <button
            onClick={() => setShowWind(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showWind
                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
            }`}
          >
            <Wind className="w-3.5 h-3.5" />
            <span>{t('map.windToggle')}</span>
          </button>

          {/* Beaufort legend */}
          {showWind && (
            <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
              <Layers className="w-3 h-3 mr-0.5" />
              {[
                { label: '0–3', color: '#22c55e' },
                { label: '4–5', color: '#f59e0b' },
                { label: '6–7', color: '#f97316' },
                { label: '8+',  color: '#ef4444' },
              ].map(b => (
                <span key={b.label} className="flex items-center gap-0.5">
                  <span className="text-sm font-bold leading-none" style={{ color: b.color }}>→</span>
                  {b.label}
                </span>
              ))}
            </div>
          )}

          {/* Route / entry legend */}
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700 pl-2">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ background: '#3b82f6' }} />
              {t('map.legendSail')}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ background: '#f97316' }} />
              {t('map.legendMotor')}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded-full inline-block flex-shrink-0 border-2 border-white" style={{ background: '#14b8a6' }} />
              {t('map.legendMooring')}
            </span>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        <div ref={mapContainerRef} className="absolute inset-0" />

        {noData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white/90 dark:bg-gray-900/90 rounded-xl px-5 py-3 text-sm text-gray-500 shadow">
              {t('map.noData')}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
