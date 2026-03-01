import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, FileText, Users, Anchor, Ship, Paperclip } from 'lucide-react'
import { db } from '../db/database'
import { generateLogbookPDF, generateShipDossierPDF, generateCrewListPDF, generateCustomsDeclarationPDF } from '../utils/pdf'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import type { CrewMember } from '../db/models'

function filterCrewByDateRange(allCrew: CrewMember[], start: string, end: string): CrewMember[] {
  return allCrew.filter(m => {
    if (!m.isActive) return false
    if (!start || !end) return true
    const from = m.onBoardFrom || '0000-01-01'
    const to = m.onBoardTo || '9999-12-31'
    return from <= end && to >= start
  })
}

export function Export() {
  const { t } = useTranslation()
  const [generating, setGenerating] = useState<string | null>(null)
  const [includeAttachments, setIncludeAttachments] = useState(true)
  const [selectedPassageId, setSelectedPassageId] = useState<number | null>(null)
  const [logbookYear, setLogbookYear] = useState('all')

  const ship = useLiveQuery(() => db.ship.toCollection().first())
  const crew = useLiveQuery(() => db.crew.toArray())
  const entries = useLiveQuery(() => db.logEntries.orderBy('[date+time]').toArray())
  const passages = useLiveQuery(() => db.passages.orderBy('departureDate').reverse().toArray())
  const lastPassage = useLiveQuery(() =>
    db.passages.orderBy('departureDate').reverse().first()
  )

  const totalDistance = useMemo(() => {
    if (!entries?.length) return 0
    return Math.round(entries.reduce((sum, e) => sum + (e.distanceSinceLastEntry ?? 0), 0))
  }, [entries])

  // Derive available years from passage departure dates
  const availableYears = useMemo(() => {
    if (!passages?.length) return []
    const years = new Set(passages.map(p => p.departureDate?.slice(0, 4)).filter(Boolean))
    return Array.from(years).sort((a, b) => (b as string).localeCompare(a as string)) as string[]
  }, [passages])

  // Entries/passages filtered by selected year
  const filteredEntries = useMemo(() => {
    if (!entries) return []
    if (logbookYear === 'all') return entries
    return entries.filter(e => e.date?.startsWith(logbookYear))
  }, [entries, logbookYear])

  const filteredPassages = useMemo(() => {
    if (!passages) return []
    if (logbookYear === 'all') return passages
    return passages.filter(p => p.departureDate?.startsWith(logbookYear))
  }, [passages, logbookYear])

  // Pre-select most recent passage
  useEffect(() => {
    if (lastPassage && selectedPassageId === null) {
      setSelectedPassageId(lastPassage.id ?? null)
    }
  }, [lastPassage])

  async function handleLogbookPDF() {
    setGenerating('logbook')
    try {
      await generateLogbookPDF(filteredEntries, ship, filteredPassages)
    } finally {
      setGenerating(null)
    }
  }

  async function handleShipDossier() {
    if (!ship) return
    setGenerating('ship')
    try {
      await generateShipDossierPDF(ship, includeAttachments)
    } finally {
      setGenerating(null)
    }
  }

  async function handleCrewList() {
    setGenerating('crew')
    try {
      await generateCrewListPDF(filteredCrew, ship, includeAttachments)
    } finally {
      setGenerating(null)
    }
  }

  async function handleCustomsDeclaration() {
    if (!ship) return
    setGenerating('customs')
    try {
      await generateCustomsDeclarationPDF(ship, filteredCrew, selectedPassage, includeAttachments)
    } finally {
      setGenerating(null)
    }
  }

  const selectedPassage = passages?.find(p => p.id === selectedPassageId) ?? lastPassage
  const filteredCrew = filterCrewByDateRange(
    crew ?? [],
    selectedPassage?.departureDate ?? '',
    selectedPassage?.arrivalDate ?? '',
  )

  const exportCards = [
    {
      id: 'logbook',
      icon: <FileText className="w-6 h-6" />,
      title: t('export.logbookPdf'),
      description: logbookYear === 'all'
        ? t('export.logbookDescAll', { count: entries?.length ?? 0, passages: passages?.length ?? 0 })
        : t('export.logbookDescSeason', { count: filteredEntries.length, passages: filteredPassages.length, year: logbookYear }),
      action: handleLogbookPDF,
      disabled: !filteredEntries.length,
      color: 'blue',
      hasAttachments: false,
    },
    {
      id: 'ship',
      icon: <Anchor className="w-6 h-6" />,
      title: t('export.shipDossier'),
      description: t('export.shipDossier'),
      action: handleShipDossier,
      disabled: !ship,
      color: 'green',
      hasAttachments: true,
    },
    {
      id: 'crew',
      icon: <Users className="w-6 h-6" />,
      title: t('export.crewList'),
      description: t('export.crewDesc', { count: filteredCrew.length, total: crew?.length ?? 0 }) + (includeAttachments ? t('export.crewDescAttachments') : ''),
      action: handleCrewList,
      disabled: !filteredCrew.length,
      color: 'purple',
      hasAttachments: true,
    },
    {
      id: 'customs',
      icon: <Ship className="w-6 h-6" />,
      title: t('export.customsDeclaration'),
      description: t('export.customsDeclaration'),
      action: handleCustomsDeclaration,
      disabled: !ship,
      color: 'orange',
      hasAttachments: true,
    },
  ]

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
        <span className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('nav.export')}</span>
      </div>

      {/* PDF exports */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">{t('export.pdfDocuments')}</h2>
          {/* Attachments toggle – only meaningful for ship dossier and crew list */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Paperclip className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">{t('export.includeAttachments')}</span>
            <button
              onClick={() => setIncludeAttachments(v => !v)}
              className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                includeAttachments ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  includeAttachments ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {exportCards.map(card => (
            <Card key={card.id} className="h-full flex flex-col">
              <div className="flex gap-4 flex-1">
                <div className={`p-3 rounded-xl bg-${card.color}-50 dark:bg-${card.color}-950 text-${card.color}-600 dark:text-${card.color}-400 flex-shrink-0 self-start`}>
                  {card.icon}
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  {/* Description — top, natural height */}
                  <div>
                    <h3 className="font-semibold">{card.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{card.description}</p>
                  </div>

                  {/* Spacer — pushes controls + button to the bottom */}
                  <div className="flex-1" />

                  {/* Controls + Button — always anchored at the bottom */}
                  <div>
                    {card.id === 'logbook' && availableYears.length > 1 && (
                      <div className="mb-3">
                        <label className="label">{t('export.yearSeason')}</label>
                        <select
                          value={logbookYear}
                          onChange={e => setLogbookYear(e.target.value)}
                          className="input !py-[5px] appearance-none"
                        >
                          <option value="all">{t('export.allYears', { count: entries?.length ?? 0 })}</option>
                          {availableYears.map(y => (
                            <option key={y} value={y}>
                              {t('export.yearEntries', { year: y, count: (entries ?? []).filter(e => e.date?.startsWith(y)).length })}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {(card.id === 'crew' || card.id === 'customs') && passages && passages.length > 0 && (
                      <div className="mb-3">
                        <label className="label">{t('export.passage')}</label>
                        <select
                          value={selectedPassageId ?? ''}
                          onChange={e => setSelectedPassageId(e.target.value ? Number(e.target.value) : null)}
                          className="input !py-[5px] appearance-none"
                        >
                          {passages.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.departurePort} → {p.arrivalPort} ({p.departureDate})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="primary"
                      className="w-full"
                      onClick={card.action}
                      disabled={card.disabled}
                      loading={generating === card.id}
                      icon={generating === card.id ? undefined : <Download className="w-4 h-4" />}
                    >
                      {generating === card.id ? t('export.generating') : t('export.generatePdf')}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Stats summary */}
      <Card>
        <CardHeader title={t('export.dataOverview')} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t('export.logEntries'), value: entries?.length ?? 0 },
            { label: t('export.crewMembers'), value: crew?.length ?? 0 },
            { label: t('export.passages'), value: passages?.length ?? 0 },
            { label: t('export.totalDistance'), value: `${totalDistance.toLocaleString()} nm` },
          ].map(item => (
            <div key={item.label} className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{item.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
