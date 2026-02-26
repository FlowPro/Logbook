import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { ShieldCheck, CheckCircle2, Circle, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { db } from '../db/database'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import type { ChecklistItem } from '../db/models'

type ChecklistType = 'pre_departure' | 'arrival' | 'storm' | 'night'

const CHECKLISTS: Record<ChecklistType, Array<{ category: string; items: string[] }>> = {
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
        'GPS/Chart Plotter kalibriert',
        'Radar getestet',
        'Kompass geprüft (Deviation)',
        'Seekarten aktuell',
        'Backup-Navigation vorhanden (Papier)',
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
        'Aktueller Wetterbericht',
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
        'Draggen/Seeanker bereit',
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
}

export function Safety() {
  const { t } = useTranslation()
  const [activeType, setActiveType] = useState<ChecklistType>('pre_departure')
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(
    CHECKLISTS.pre_departure.map(c => c.category)
  ))

  const checklist = CHECKLISTS[activeType]
  const allItems = checklist.flatMap(c => c.items)
  const completedCount = allItems.filter(item => checkedItems.has(`${activeType}-${item}`)).length
  const progress = allItems.length > 0 ? Math.round((completedCount / allItems.length) * 100) : 0

  function toggleItem(key: string) {
    setCheckedItems(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleCategory(cat: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  function resetChecklist() {
    const keys = allItems.map(item => `${activeType}-${item}`)
    setCheckedItems(prev => {
      const next = new Set(prev)
      keys.forEach(k => next.delete(k))
      return next
    })
  }

  function changeType(type: ChecklistType) {
    setActiveType(type)
    setExpandedCategories(new Set(CHECKLISTS[type].map(c => c.category)))
  }

  const typeLabels: Record<ChecklistType, string> = {
    pre_departure: t('safety.preDeparture'),
    arrival: t('safety.arrival'),
    storm: t('safety.storm'),
    night: t('safety.night'),
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">{t('safety.title')}</h1>

      {/* Type selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {(Object.keys(typeLabels) as ChecklistType[]).map(type => (
          <button
            key={type}
            onClick={() => changeType(type)}
            className={`py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
              activeType === type
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            {typeLabels[type]}
          </button>
        ))}
      </div>

      {/* Progress */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <span className="font-semibold">
              {completedCount} / {allItems.length} erledigt
            </span>
          </div>
          <div className="flex items-center gap-2">
            {progress === 100 && (
              <Badge variant="success">Vollständig ✓</Badge>
            )}
            <Button variant="ghost" size="sm" onClick={resetChecklist}>
              Zurücksetzen
            </Button>
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

      {/* Checklist items */}
      <div className="space-y-3">
        {checklist.map(section => {
          const isExpanded = expandedCategories.has(section.category)
          const sectionItems = section.items
          const sectionCompleted = sectionItems.filter(item => checkedItems.has(`${activeType}-${item}`)).length

          return (
            <Card key={section.category} padding={false}>
              <button
                onClick={() => toggleCategory(section.category)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{section.category}</span>
                  <span className="text-sm text-gray-500">
                    {sectionCompleted}/{sectionItems.length}
                  </span>
                  {sectionCompleted === sectionItems.length && (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                  {sectionItems.map(item => {
                    const key = `${activeType}-${item}`
                    const checked = checkedItems.has(key)
                    return (
                      <label
                        key={item}
                        className="flex items-start gap-3 cursor-pointer group"
                        onClick={() => toggleItem(key)}
                      >
                        <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          checked
                            ? 'border-green-500 bg-green-500'
                            : 'border-gray-300 dark:border-gray-600 group-hover:border-blue-400'
                        }`}>
                          {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <span className={`text-sm leading-relaxed ${checked ? 'line-through text-gray-400' : ''}`}>
                          {item}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
