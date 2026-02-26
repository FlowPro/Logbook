# Logbuch – CLAUDE.md

Maritime sailing logbook PWA for iOS/macOS/Windows (offline-capable).

## Commands

```bash
npm run dev        # Dev server (Vite, port 5173)
npm run build      # Type-check + production build (tsc && vite build)
npm run server     # NMEA bridge only (tsx server/nmea-bridge.ts)
npm run dev:nmea   # Dev + NMEA bridge concurrently
```

Always run `npm run build` after changes to verify TypeScript compiles cleanly.

## Stack

- **Vite 5** + **React 18** + **TypeScript** (strict)
- **Tailwind CSS v3** — dark mode via `class` strategy
- **React Router v6** — SPA routing
- **Dexie.js v4** — IndexedDB ORM (`dexie-react-hooks` for reactive queries)
- **React Hook Form v7** + **Zod** — form validation
- **jsPDF + autotable** — PDF export
- **Recharts** — charts/statistics
- **lucide-react** — icons
- **i18next + react-i18next** — DE/EN translations
- **sonner** — toast notifications
- **@hello-pangea/dnd** — Kanban drag-and-drop (Maintenance)
- **vite-plugin-pwa** — Service worker, offline caching
- **date-fns v4** — date utilities
- **Node v19.1.0** on this machine

## Project Structure

```
src/
├── components/
│   ├── layout/       AppLayout.tsx, Header.tsx, Sidebar.tsx
│   └── ui/           Badge, Button, Card, Input, Select, Modal,
│                     CoordinateInput, BeaufortPicker, OktasPicker,
│                     SailDiagram, NMEADebugPanel, NMEAImportPanel,
│                     CountrySelect, FileUpload
├── db/
│   ├── database.ts   Dexie class + schema versions + export/import
│   └── models.ts     All TypeScript interfaces and types
├── hooks/            useSettings, useShip, useCrew, useLogEntries, useNMEA
├── i18n/             index.ts (setup), de.ts, en.ts
├── pages/            Dashboard, Logbook, LogEntryForm, PortLog, ShipData,
│                     CrewManagement, Maintenance, Summary, Search,
│                     Export, Settings, Emergency, Safety
└── utils/            geo.ts, units.ts, pdf.ts, backupDir.ts
server/               nmea-bridge.ts, nmea-parser.ts, config.json
```

## Database (Dexie v4)

**Current schema version: 5**

| Table | Key fields |
|-------|-----------|
| `ship` | `++id, name, flag, mmsi` |
| `crew` | `++id, lastName, firstName, role, isActive, onBoardFrom, onBoardTo` |
| `logEntries` | `++id, passageId, date, time, [date+time], [passageId+date], watchOfficer` |
| `passages` | `++id, departurePort, arrivalPort, departureDate, arrivalDate, customsCleared` |
| `maintenance` | `++id, date, category, status, engineHoursAtService` |
| `settings` | `++id` |
| `watches` | `++id, date, watchOfficer` |
| `checklists` | `++id, date, type` |

**Rules:**
- `orderBy()` requires an indexed field — never call it on non-indexed columns
- Use `each()` cursor for aggregations over large tables (never `toArray().reduce()`)
- New schema versions must be added as `this.version(N)` — never modify existing versions
- Compound indexes: `[date+time]` and `[passageId+date]` on logEntries

## Key Patterns & Gotchas

### Decimal number inputs
Use `type="text" inputMode="decimal"` with `setValueAs` to handle German locale commas:
```tsx
<input type="text" inputMode="decimal" {...register('field', {
  setValueAs: v => parseFloat(String(v).replace(',', '.')) || 0
})} />
```

### PortLog.tsx — Ship import conflict
`Ship` type is imported from `../db/models`. **Never** import the lucide `Ship` icon in this file — it creates a naming conflict. Use `Anchor`, `Building2`, or other icons instead.

### react-to-print v3
Use `contentRef` prop (not the old `content` callback):
```tsx
const ref = useRef<HTMLDivElement>(null)
useReactToPrint({ contentRef: ref, documentTitle: '...' })
```

### Badge component
The `children` prop is optional. The `beaufort` variant auto-renders from `beaufortForce` prop alone.

### NMEA freshness
`useNMEA()` exposes `data.updatedAt` (Date.now() timestamp). Stale threshold = 30 seconds. Header badge uses 3 states: green (active + fresh), amber (stale > 30 s), gray (disconnected).

### PDF page width
Use `doc.internal.pageSize.getWidth()` — never hardcode `210` (breaks landscape PDFs).

### i18n
Add new keys to **both** `src/i18n/de.ts` and `src/i18n/en.ts` simultaneously.

## NMEA Bridge (server/)

A separate Node.js process that bridges a TCP/UDP NMEA device to the browser via WebSocket. Controlled via HTTP API on the same port (3001):

- `GET  /api/status` → bridge + connection status
- `POST /api/config` → update nmea host/port/protocol + reconnect
- `POST /api/connect` / `POST /api/disconnect` → control NMEA connection

Start with `npm run server` or `npm run dev:nmea`. The Vite dev server includes a `bridgeControlPlugin` that proxies `/api/bridge-control/*` calls.

## PWA / Build Notes

- Workbox precache limit set to **3 MB** (`maximumFileSizeToCacheInBytes`) to accommodate `@hello-pangea/dnd`
- Chunk size warning at 500 KB is expected and acceptable (main bundle ~2.2 MB gzipped ~700 KB)
- Service worker auto-updates on new build

## Pages Overview

| Page | Route | Notes |
|------|-------|-------|
| Dashboard | `/` | KPIs, recent entries; uses `each()` cursor for distance sum |
| Port Log | `/ports` | Passages with embedded log entries; year filter; season lock |
| Search | `/search` | 300 ms debounce; DB-level date index for `date:` operator |
| Crew | `/crew` | Crew roster, qualifications, passport scans |
| Summary | `/summary` | Recharts stats; includes mooring status pie; date range filter |
| Maintenance | `/maintenance` | Kanban (planned/in_progress/done); year filter for done+archive |
| Export | `/export` | PDF logbook (year filter), crew list, ship dossier, customs form |
| Ship | `/ship` | Registration, specs, documents |
| Settings | `/settings` | Units, language, dark mode, NMEA bridge, backup, danger zone |
| Emergency | `/emergency` | MAYDAY, SOS, emergency contacts |
| Safety | `/safety` | Pre-departure checklists |

## Sidebar Badges

| Nav item | Badge value |
|----------|-------------|
| Port Log | `passages.count()` |
| Maintenance | open tasks (`planned` + `in_progress`, not archived) |

No badge on Search (removed — total count has no UX value).
