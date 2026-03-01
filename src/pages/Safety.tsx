import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import jsPDF from 'jspdf'
import { ShieldCheck, CheckCircle2, ChevronDown, ChevronUp, PlusCircle, X, Pencil, Check, FileText, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'
import { db } from '../db/database'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'

// ── Types ─────────────────────────────────────────────────────────────────────

type ChecklistType = 'pre_departure' | 'arrival' | 'storm' | 'night' | 'crew_briefing'

const CHECKLIST_TYPES: ChecklistType[] = ['pre_departure', 'arrival', 'storm', 'night', 'crew_briefing']

const TYPE_PREFIX: Record<ChecklistType, string> = {
  pre_departure: 'pd', arrival: 'ar', storm: 'st', night: 'ni', crew_briefing: 'cb',
}

interface ChecklistSection { category: string; items: string[] }

// ── Checklist content (bilingual) ─────────────────────────────────────────────

const CHECKLISTS: Record<'en' | 'de', Record<ChecklistType, ChecklistSection[]>> = {
  en: {
    pre_departure: [
      {
        category: 'Safety Equipment',
        items: [
          'Life jackets inspected and accessible',
          'Lifebuoy with heaving line ready',
          'Life raft inspected (service date)',
          'Fire extinguisher inspected',
          'Flares available and valid',
          'First aid kit complete',
          'EPIRB inspected and activated',
          'AIS active and configured',
        ],
      },
      {
        category: 'Navigation',
        items: [
          'GPS / Chart plotter calibrated',
          'Radar tested',
          'Compass checked (deviation)',
          'Charts up to date',
          'Backup navigation available (paper charts)',
          'Emergency frequency known (VHF Channel 16)',
        ],
      },
      {
        category: 'Vessel',
        items: [
          'Engine checked (oil, coolant)',
          'Fuel topped up',
          'Freshwater topped up',
          'Battery charged',
          'Bilge checked – empty',
          'Sea cocks closed',
          'Rig inspected',
          'Halyards and sheets checked',
        ],
      },
      {
        category: 'Crew',
        items: [
          'Watch schedule created',
          'Crew briefing completed',
          'Emergency signals discussed',
          'MOB procedure explained',
          'Marina fees paid',
          'Cleared out customs (if required)',
        ],
      },
      {
        category: 'Weather',
        items: [
          'Current weather forecast reviewed',
          'Contingency strategy for bad weather',
          'GRIB data downloaded',
          'NAVTEX received',
        ],
      },
    ],
    arrival: [
      {
        category: 'Arrival',
        items: [
          'Harbour authority contacted',
          'Anchorage / berth identified',
          'Fenders and lines ready',
          'Flag correct',
          'Customs clearance required?',
        ],
      },
      {
        category: 'After Arrival',
        items: [
          'Vessel secured',
          'Engine stopped',
          'Sails stowed',
          'Shore power connected (if available)',
          'Logbook updated',
        ],
      },
    ],
    storm: [
      {
        category: 'Preparation',
        items: [
          'All hatches and openings closed',
          'All loose items secured',
          'Storm sails prepared',
          'Drogue / sea anchor ready',
          'Crew in life jackets',
          'Safety harnesses worn',
          'Lifelines rigged and checked',
        ],
      },
      {
        category: 'Navigation',
        items: [
          'Course to open water',
          'Position fixed',
          'Distance to land calculated',
          'Nearest harbour of refuge identified',
          'Distress call prepared',
        ],
      },
    ],
    night: [
      {
        category: 'Before Night',
        items: [
          'Navigation lights switched on',
          'Radar active',
          'Watch assigned',
          'Caffeine available ☕',
          'Warm clothing ready',
          'Red night light in cockpit',
        ],
      },
      {
        category: 'Safety',
        items: [
          'Safety tethers clipped on',
          'Torch ready',
          'Next waypoints / hazards known',
          'AIS alarm configured',
        ],
      },
    ],
    crew_briefing: [
      {
        category: 'Vessel Layout',
        items: [
          'Engine room location and emergency shut-off',
          'Fuel shut-off valve location',
          'Sea cocks / through-hull locations',
          'Bilge pumps – manual and electric',
          'Water tanks and pump location',
          'Gas system – shut-off valve and safety',
        ],
      },
      {
        category: 'Safety Equipment',
        items: [
          'Life jackets – location, type, how to fit and use',
          'Harness and tether – when and how to use',
          'Life raft – location and activation procedure',
          'Lifebuoy and danbuoy – location',
          'Fire extinguishers – locations and operation',
          'Flares and pyrotechnics – location and use',
          'EPIRB – location and activation',
          'First aid kit location',
        ],
      },
      {
        category: 'Emergency Procedures',
        items: [
          'MOB – shout, throw, point, assign, recover',
          'MAYDAY on VHF Channel 16 (say 3× MAYDAY)',
          'DSC distress alert (red button / MMSI)',
          'EPIRB activation procedure',
          'Fire – stop engine, close hatches, fight or abandon',
          'Abandon ship – grab bag, life raft, last resort',
        ],
      },
      {
        category: 'Navigation & Watch',
        items: [
          'Chart plotter / navigation overview',
          'VHF radio – monitor Channel 16 at all times',
          'AIS – identifying other vessels',
          'Watch duties and logbook entries',
          'Call skipper if in doubt – never hesitate',
        ],
      },
      {
        category: 'Onboard Rules',
        items: [
          'Harness mandatory at night and Bft 5+',
          'Clip tether before leaving cockpit at night',
          'No-smoking areas and policies',
          'Galley safety – hot liquids in rough weather',
          'Respect crew rest periods',
          'I am ready for sea and confirm this briefing',
        ],
      },
    ],
  },
  de: {
    pre_departure: [
      {
        category: 'Sicherheitsausrüstung',
        items: [
          'Rettungswesten geprüft und verfügbar',
          'Rettungsring mit Wurfleine bereit',
          'Rettungsinsel geprüft (Service-Datum)',
          'Feuerlöscher geprüft',
          'Leuchtraketen vorhanden und gültig',
          'Erste-Hilfe-Kasten vollständig',
          'EPIRB geprüft und aktiviert',
          'AIS aktiviert und konfiguriert',
        ],
      },
      {
        category: 'Navigation',
        items: [
          'GPS / Chart Plotter kalibriert',
          'Radar getestet',
          'Kompass geprüft (Deviation)',
          'Seekarten aktuell',
          'Backup-Navigation vorhanden (Papierkarten)',
          'Notruffrequenz bekannt (VHF Kanal 16)',
        ],
      },
      {
        category: 'Schiff',
        items: [
          'Motor geprüft (Öl, Kühlwasser)',
          'Kraftstoff aufgefüllt',
          'Trinkwasser aufgefüllt',
          'Batterie geladen',
          'Bilge geprüft – leer',
          'Seeventile geschlossen',
          'Rigg gecheckt',
          'Fallen und Schoten geprüft',
        ],
      },
      {
        category: 'Crew',
        items: [
          'Wachplan erstellt',
          'Crewbriefing durchgeführt',
          'Notfall-Signale besprochen',
          'MOB-Verfahren erklärt',
          'Hafengebühren bezahlt',
          'Ausklariert (wenn nötig)',
        ],
      },
      {
        category: 'Wetter',
        items: [
          'Aktueller Wetterbericht geprüft',
          'Zugangsstrategie bei Sturm',
          'GRIB-Daten heruntergeladen',
          'NAVTEX empfangen',
        ],
      },
    ],
    arrival: [
      {
        category: 'Ankunft',
        items: [
          'Hafenbehörde kontaktiert',
          'Ankerboje / Liegeplatz identifiziert',
          'Fender und Leinen bereit',
          'Flagge korrekt',
          'Einklarierung notwendig?',
        ],
      },
      {
        category: 'Nach der Ankunft',
        items: [
          'Schiff festgemacht',
          'Motor ausgestellt',
          'Segel geborgen',
          'Landstrom angeschlossen (wenn möglich)',
          'Logbuch aktualisiert',
        ],
      },
    ],
    storm: [
      {
        category: 'Vorbereitung',
        items: [
          'Alle Luken und Öffnungen geschlossen',
          'Alle losen Gegenstände gesichert',
          'Sturmsegel vorbereitet',
          'Draggen / Seeanker bereit',
          'Crew in Rettungswesten',
          'Sicherheitsleine anlegen',
          'Lifelines gespannt und prüfen',
        ],
      },
      {
        category: 'Navigation',
        items: [
          'Kurs auf freies Wasser',
          'Position fixiert',
          'Land-Abstand berechnet',
          'Nächster Nothafen bekannt',
          'Notruf vorbereitet',
        ],
      },
    ],
    night: [
      {
        category: 'Vor der Nacht',
        items: [
          'Positionslichter eingeschaltet',
          'Radar aktiv',
          'Wache eingeteilt',
          'Koffein verfügbar ☕',
          'Warme Kleidung bereit',
          'Rotes Nachtlicht am Cockpit',
        ],
      },
      {
        category: 'Sicherheit',
        items: [
          'Sicherheitsleinen eingeclippt',
          'Taschenlampe bereit',
          'Nächste Fahrwasser-Objekte bekannt',
          'AIS-Alarm konfiguriert',
        ],
      },
    ],
    crew_briefing: [
      {
        category: 'Schiffslayout',
        items: [
          'Motorraum und Notabschaltung',
          'Kraftstoffabsperrventil Standort',
          'Seeventile und Durchführungen',
          'Bilgepumpen – manuell und elektrisch',
          'Wassertanks und Pumpenstandort',
          'Gasanlage – Absperrventil und Sicherheit',
        ],
      },
      {
        category: 'Sicherheitsausrüstung',
        items: [
          'Rettungswesten – Standort, Typ, Anlegen und Bedienung',
          'Sicherheitsgurt und Leine – wann und wie verwenden',
          'Rettungsinsel – Standort und Auslöseverfahren',
          'Rettungsring und Danbuoy – Standort',
          'Feuerlöscher – Standorte und Bedienung',
          'Leuchtraketen und Pyrotechnik – Standort und Verwendung',
          'EPIRB – Standort und Aktivierung',
          'Erste-Hilfe-Kasten Standort',
        ],
      },
      {
        category: 'Notfallverfahren',
        items: [
          'MOB – rufen, werfen, zeigen, zuweisen, retten',
          'MAYDAY auf VHF Kanal 16 (3× MAYDAY ansagen)',
          'DSC-Notruf (roter Knopf / MMSI)',
          'EPIRB-Aktivierungsverfahren',
          'Brand – Motor abstellen, Luken schliessen, bekämpfen oder verlassen',
          'Schiff verlassen – Notfallpack, Rettungsinsel, letzter Ausweg',
        ],
      },
      {
        category: 'Navigation & Wache',
        items: [
          'Chart Plotter / Navigationsübersicht',
          'VHF-Funk – Kanal 16 jederzeit abhören',
          'AIS – andere Schiffe identifizieren',
          'Wachpflichten und Logbucheinträge',
          'Skipper bei Unsicherheit sofort wecken',
        ],
      },
      {
        category: 'Bordregeln',
        items: [
          'Sicherheitsgurt nachts und ab Bft 5+',
          'Leine einklicken vor Verlassen des Cockpits nachts',
          'Rauchverbotszonen und -regeln',
          'Küchen-Sicherheit – heisse Flüssigkeiten bei Seegang',
          'Ruhezeiten der Crew respektieren',
          'Ich bin seeklär und bestätige diese Einweisung',
        ],
      },
    ],
  },
}

// ── Persistence ───────────────────────────────────────────────────────────────

/** Custom item with section index so it renders inside the right category */
interface CustomItem { id: string; text: string; checked: boolean; catIdx: number }

interface TypePersistence {
  checkedKeys: Set<string>
  removedKeys: Set<string>
  custom: CustomItem[]
}

function emptyState(): TypePersistence {
  return { checkedKeys: new Set(), removedKeys: new Set(), custom: [] }
}

function loadAll(): Record<ChecklistType, TypePersistence> {
  const result = {} as Record<ChecklistType, TypePersistence>
  for (const type of CHECKLIST_TYPES) {
    try {
      const raw = localStorage.getItem(`safety-cl-${type}`)
      if (raw) {
        const p = JSON.parse(raw)
        result[type] = {
          checkedKeys: new Set(p.checkedKeys ?? []),
          removedKeys: new Set(p.removedKeys ?? []),
          // migrate old flat custom items (no catIdx) → assign to section 0
          custom: (p.custom ?? []).map((c: CustomItem) => ({ ...c, catIdx: c.catIdx ?? 0 })),
        }
      } else {
        result[type] = emptyState()
      }
    } catch {
      result[type] = emptyState()
    }
  }
  return result
}

function persistState(type: ChecklistType, state: TypePersistence) {
  try {
    localStorage.setItem(`safety-cl-${type}`, JSON.stringify({
      checkedKeys: [...state.checkedKeys],
      removedKeys: [...state.removedKeys],
      custom: state.custom,
    }))
  } catch { /* storage full / private mode */ }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Safety() {
  const { t, i18n } = useTranslation()
  const [activeType,    setActiveType]    = useState<ChecklistType>('pre_departure')
  const [states,        setStates]        = useState<Record<ChecklistType, TypePersistence>>(loadAll)
  const [editMode,      setEditMode]      = useState(false)
  /** Per-section add-item input text, keyed by catIdx */
  const [newTexts, setNewTexts] = useState<Record<number, string>>({})
  const [expandedCats,  setExpandedCats]  = useState<Set<string>>(new Set())

  const ship       = useLiveQuery(() => db.ship.toCollection().first())
  const activeCrew = useLiveQuery(() => db.crew.filter(c => c.isActive).toArray())

  const lang: 'en' | 'de' = i18n.language === 'de' ? 'de' : 'en'
  const sections = CHECKLISTS[lang][activeType]

  useEffect(() => {
    setExpandedCats(new Set(sections.map(s => s.category)))
    setEditMode(false)
    setNewTexts({})
  }, [activeType, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const cur = states[activeType]

  function update(fn: (prev: TypePersistence) => TypePersistence) {
    setStates(prev => {
      const next = { ...prev, [activeType]: fn(prev[activeType]) }
      persistState(activeType, next[activeType])
      return next
    })
  }

  // Build display sections — default items (minus removed) + custom items for that section
  const displaySections = sections.map((section, catIdx) => {
    const prefix = TYPE_PREFIX[activeType]
    const defaultItems = section.items
      .map((text, itemIdx) => {
        const id = `${prefix}_c${catIdx}_i${itemIdx}`
        return { id, text, isCustom: false as const, checked: cur.checkedKeys.has(id) }
      })
      .filter(item => !cur.removedKeys.has(item.id))

    const customItems = cur.custom
      .filter(c => c.catIdx === catIdx)
      .map(c => ({ id: c.id, text: c.text, isCustom: true as const, checked: c.checked }))

    return { category: section.category, catIdx, items: [...defaultItems, ...customItems] }
  })

  const allItems = displaySections.flatMap(s => s.items)
  const completedCount = allItems.filter(i => i.checked).length
  const progress = allItems.length > 0 ? Math.round((completedCount / allItems.length) * 100) : 0

  function toggleItem(id: string, isCustom: boolean) {
    update(prev => {
      if (isCustom) {
        return { ...prev, custom: prev.custom.map(c => c.id === id ? { ...c, checked: !c.checked } : c) }
      }
      const next = new Set(prev.checkedKeys)
      next.has(id) ? next.delete(id) : next.add(id)
      return { ...prev, checkedKeys: next }
    })
  }

  function removeItem(id: string, isCustom: boolean) {
    update(prev => {
      if (isCustom) return { ...prev, custom: prev.custom.filter(c => c.id !== id) }
      const removed = new Set(prev.removedKeys)
      removed.add(id)
      const checked = new Set(prev.checkedKeys)
      checked.delete(id)
      return { ...prev, removedKeys: removed, checkedKeys: checked }
    })
  }

  function addCustomItem(catIdx: number) {
    const text = (newTexts[catIdx] ?? '').trim()
    if (!text) return
    update(prev => ({
      ...prev,
      custom: [...prev.custom, { id: `custom-${crypto.randomUUID()}`, text, checked: false, catIdx }],
    }))
    setNewTexts(prev => ({ ...prev, [catIdx]: '' }))
  }

  function resetChecklist() {
    update(() => emptyState())
  }

  function toggleCat(cat: string) {
    setExpandedCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  // ── PDF export ──────────────────────────────────────────────────────────────

  function exportBriefingPdf() {
    const doc = new jsPDF()
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    const M = 15
    const shipName = ship?.name ?? '—'
    const today = format(new Date(), 'yyyy-MM-dd')

    function drawHeader() {
      doc.setTextColor(30, 30, 30)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text(t('safety.pdfTitle'), M, 13)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      const shipStr = ship?.name
        ? `${ship.name}${ship.callSign ? '  ·  Call Sign ' + ship.callSign : ''}${ship.mmsi ? '  ·  MMSI ' + ship.mmsi : ''}`
        : '—'
      doc.text(`${shipStr}  ·  ${format(new Date(), 'yyyy-MM-dd HH:mm')} UTC`, W - M, 13, { align: 'right' })
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(M, 17, W - M, 17)
      doc.setTextColor(0, 0, 0)
    }

    function drawFooter(pg: number, total: number) {
      doc.setFontSize(8)
      doc.setTextColor(128, 128, 128)
      doc.text(`Page ${pg} / ${total}`, W / 2, H - 8, { align: 'center' })
      doc.text(t('safety.pdfTitle'), M, H - 8)
      doc.text(today, W - M, H - 8, { align: 'right' })
      doc.setTextColor(0, 0, 0)
    }

    drawHeader()
    let y = 24

    // Checklist sections
    for (const section of displaySections) {
      if (section.items.length === 0) continue
      if (y > 252) { doc.addPage(); drawHeader(); y = 24 }

      doc.setFillColor(220, 220, 220)
      doc.rect(M, y - 5, W - 2 * M, 7.5, 'F')
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(section.category, M + 2, y)
      doc.setTextColor(0, 0, 0)
      y += 8

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      for (const item of section.items) {
        if (y > 272) { doc.addPage(); drawHeader(); y = 24 }
        doc.setDrawColor(item.checked ? 40 : 80, item.checked ? 150 : 80, item.checked ? 40 : 80)
        doc.setLineWidth(0.3)
        doc.rect(M, y - 3.5, 3.8, 3.8)
        if (item.checked) {
          doc.setLineWidth(0.6)
          doc.line(M + 0.5, y - 1.5, M + 1.4, y + 0.1)
          doc.line(M + 1.4, y + 0.1, M + 3.3, y - 3.0)
        }
        const lines = doc.splitTextToSize(item.text, W - 2 * M - 8) as string[]
        doc.text(lines, M + 6, y)
        y += lines.length * 5 + 1
      }
      y += 4
    }

    // Signature section
    if (activeCrew && activeCrew.length > 0) {
      if (y > 200) { doc.addPage(); drawHeader(); y = 24 }
      y += 4
      doc.setFillColor(220, 220, 220)
      doc.rect(M, y - 5, W - 2 * M, 7.5, 'F')
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(t('safety.pdfSignatureSection'), M + 2, y)
      doc.setTextColor(0, 0, 0)
      y += 10

      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)
      const noteLines = doc.splitTextToSize(t('safety.pdfSignatureNote'), W - 2 * M) as string[]
      doc.text(noteLines, M, y)
      doc.setTextColor(0, 0, 0)
      y += noteLines.length * 4 + 8

      for (const member of activeCrew) {
        if (y > 258) { doc.addPage(); drawHeader(); y = 24 }
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text(`${member.firstName} ${member.lastName}`, M, y)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 100, 100)
        doc.text(t(`crew.roles.${member.role}`), M + 72, y)
        doc.setTextColor(0, 0, 0)
        y += 9
        doc.setDrawColor(0, 0, 0)
        doc.setLineWidth(0.4)
        doc.line(M, y, W - M, y)
        doc.setFontSize(7)
        doc.setTextColor(160, 160, 160)
        doc.text(t('safety.pdfSignatureLine'), M, y + 3.5)
        doc.setTextColor(0, 0, 0)
        y += 14
      }
    }

    // Footer on every page
    const totalPages = doc.getNumberOfPages()
    for (let pg = 1; pg <= totalPages; pg++) {
      doc.setPage(pg)
      drawFooter(pg, totalPages)
    }

    doc.save(`crew-briefing-${today}-${shipName.replace(/\s+/g, '-')}.pdf`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const typeLabels: Record<ChecklistType, string> = {
    pre_departure: t('safety.preDeparture'),
    arrival:       t('safety.arrival'),
    storm:         t('safety.storm'),
    night:         t('safety.night'),
    crew_briefing: t('safety.crewBriefing'),
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 flex-wrap">
        <span className="text-base font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">{t('nav.safety')}</span>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
        {CHECKLIST_TYPES.map(type => (
          <button
            key={type}
            onClick={() => setActiveType(type)}
            className={`py-1.5 px-3 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
              activeType === type
                ? type === 'crew_briefing'
                  ? 'bg-purple-600 text-white'
                  : 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {typeLabels[type]}
          </button>
        ))}
      </div>

      {/* Progress + action bar */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <span className="font-semibold text-sm">
              {t('safety.completedOf', { done: completedCount, total: allItems.length })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {progress === 100 && <Badge variant="success">{t('safety.completeLabel')}</Badge>}
            {activeType === 'crew_briefing' && (
              <Button
                variant="secondary"
                size="sm"
                icon={<FileText className="w-3.5 h-3.5" />}
                onClick={exportBriefingPdf}
              >
                {t('safety.exportPdf')}
              </Button>
            )}
            <button
              onClick={() => setEditMode(v => !v)}
              title={editMode ? t('safety.doneEditing') : t('safety.editList')}
              className={`p-1.5 rounded-lg transition-colors ${
                editMode
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {editMode ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
            <button
              onClick={resetChecklist}
              title={t('safety.reset')}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              progress === 100 ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-right text-sm text-gray-500 mt-1">{progress}%</div>
      </Card>

      {/* Checklist sections */}
      <div className="space-y-3">
        {displaySections.map(section => {
          if (section.items.length === 0 && !editMode) return null
          const isExpanded = expandedCats.has(section.category)
          const sectionDone = section.items.filter(i => i.checked).length

          return (
            <Card key={section.category} padding={false}>
              {/* Section header (collapsible) */}
              <button
                onClick={() => toggleCat(section.category)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{section.category}</span>
                  <span className="text-sm text-gray-500">{sectionDone}/{section.items.length}</span>
                  {section.items.length > 0 && sectionDone === section.items.length && (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                </div>
                {isExpanded
                  ? <ChevronUp className="w-4 h-4 text-gray-400" />
                  : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-2 space-y-1.5">
                  {/* Items */}
                  {section.items.map(item => (
                    <div key={item.id} className="flex items-start gap-2 group">
                      {editMode && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id, item.isCustom)}
                          className="mt-0.5 flex-shrink-0 p-0.5 rounded text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <label
                        className="flex items-start gap-3 flex-1 cursor-pointer"
                        onClick={() => toggleItem(item.id, item.isCustom)}
                      >
                        <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          item.checked
                            ? 'border-green-500 bg-green-500'
                            : 'border-gray-300 dark:border-gray-600 group-hover:border-blue-400'
                        }`}>
                          {item.checked && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <span className={`text-sm leading-relaxed ${
                          item.checked ? 'line-through text-gray-400 dark:text-gray-500' : ''
                        }${item.isCustom ? ' italic' : ''}`}>
                          {item.text}
                        </span>
                      </label>
                    </div>
                  ))}

                  {/* Add-item row (edit mode only) */}
                  {editMode && (
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={newTexts[section.catIdx] ?? ''}
                        onChange={e => setNewTexts(prev => ({ ...prev, [section.catIdx]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomItem(section.catIdx) } }}
                        placeholder={t('safety.addItemPlaceholder')}
                        className="input text-sm flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => addCustomItem(section.catIdx)}
                        disabled={!(newTexts[section.catIdx] ?? '').trim()}
                        icon={<PlusCircle className="w-3.5 h-3.5" />}
                      >
                        {t('safety.addItem')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
