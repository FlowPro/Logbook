import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Radio } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'

// ── Data ─────────────────────────────────────────────────────────────────────

interface Channel {
  ch: string
  use: { de: string; en: string }
  who: { de: string; en: string }
  notes?: { de: string; en: string }
  highlight?: 'red' | 'amber' | 'blue'
}

const INTERNATIONAL: Channel[] = [
  { ch: '16',  highlight: 'red',   use: { de: 'Notruf & Wachhören (Pflichtkanal)', en: 'Distress & Calling (mandatory watch)' }, who: { de: 'Alle Schiffe', en: 'All vessels' } },
  { ch: '70',  highlight: 'red',   use: { de: 'DSC – Digital Selective Calling (Notruf-Digitalalarm)', en: 'DSC – Digital Selective Calling (digital distress)' }, who: { de: 'Alle mit DSC-Gerät', en: 'All DSC-equipped vessels' } },
  { ch: '13',  highlight: 'amber', use: { de: 'Brückenkommunikation / Schiff–Schiff (maritime)', en: 'Bridge-to-bridge / Ship–Ship (maritime)' }, who: { de: 'Handelsschiffe, Brücken', en: 'Commercial vessels, bridges' } },
  { ch: '9',   use: { de: 'Arbeitskanal (auch Marina-Ausweichkanal)', en: 'Working channel (marina fallback)' }, who: { de: 'Yacht, Marina', en: 'Yacht, marina' } },
  { ch: '10',  use: { de: 'Ölbekämpfung / Behörden', en: 'Oil pollution / authority operations' }, who: { de: 'Behörden', en: 'Authorities' } },
  { ch: '11',  use: { de: 'Schiff–Hafen Verkehrsdienst (VTS)', en: 'Ship–port traffic service (VTS)' }, who: { de: 'VTS, Port control', en: 'VTS, port control' } },
  { ch: '12',  use: { de: 'Hafen Verkehrsdienst (VTS)', en: 'Port traffic service (VTS)' }, who: { de: 'VTS', en: 'VTS' } },
  { ch: '14',  use: { de: 'Hafen Betrieb / Port operations', en: 'Port operations' }, who: { de: 'Hafen, Schleusen', en: 'Port, locks' } },
  { ch: '17',  use: { de: 'Schiff–Küste Nahbereich', en: 'Ship–shore (local)' }, who: { de: 'Küstenstation', en: 'Coast station' } },
  { ch: '22A', highlight: 'blue', use: { de: 'US Coast Guard Koordination (nur USA)', en: 'US Coast Guard coordination (USA only)' }, who: { de: 'USCG', en: 'USCG' } },
  { ch: '23',  use: { de: 'Küstenstation / Behörden', en: 'Coast station / authorities' }, who: { de: 'Behörden', en: 'Authorities' } },
  { ch: '67',  use: { de: 'Küstenwache UK / kleinere Schiffe', en: 'UK coastguard / small craft safety' }, who: { de: 'HM Coastguard', en: 'HM Coastguard' } },
  { ch: '72',  use: { de: 'Schiff–Schiff (international, nicht für Küste)', en: 'Ship–Ship (international, not shore)' }, who: { de: 'Yachten', en: 'Yachts' } },
  { ch: '77',  use: { de: 'Schiff–Schiff', en: 'Ship–Ship' }, who: { de: 'Yachten', en: 'Yachts' } },
  { ch: '80',  use: { de: 'Schiff–Hafen (Europa)', en: 'Ship–port (Europe)' }, who: { de: 'Hafen Europa', en: 'Port Europe' } },
]

interface RegionChannel { ch: string; location: { de: string; en: string }; note?: { de: string; en: string } }

interface Region {
  name: { de: string; en: string }
  channels: RegionChannel[]
}

const REGIONS: Region[] = [
  {
    name: { de: 'Mittelmeer', en: 'Mediterranean' },
    channels: [
      { ch: '9',  location: { de: 'Allgemeine Marinas', en: 'General marinas' } },
      { ch: '12', location: { de: 'Häfen & Port control allgemein', en: 'Ports & port control general' } },
      { ch: '16', location: { de: 'Mittelmeer-Wachhören', en: 'Med watch channel' } },
      { ch: '69', location: { de: 'Spanien: Manche Marinas', en: 'Spain: some marinas' } },
      { ch: '71', location: { de: 'Frankreich: Häfen (lokal)', en: 'France: ports (local)' } },
      { ch: '73', location: { de: 'Frankreich: CROSS (SAR)', en: 'France: CROSS (SAR)' } },
      { ch: '74', location: { de: 'Frankreich: CROSS (SAR, alternativ)', en: 'France: CROSS (SAR, alt)' } },
      { ch: '17', location: { de: 'Kroatien: Häfen / VHF-Wetter', en: 'Croatia: ports / weather' } },
      { ch: '04', location: { de: 'Griechenland: Port police (Athen)', en: 'Greece: port police (Athens)' } },
      { ch: '12', location: { de: 'Griechenland: Häfen allgemein', en: 'Greece: ports general' } },
      { ch: '77', location: { de: 'Türkei: Marina-Kontakt allgemein', en: 'Turkey: marina contact general' } },
    ],
  },
  {
    name: { de: 'Nordsee & Ärmelkanal', en: 'North Sea & English Channel' },
    channels: [
      { ch: '67', location: { de: 'HM Coastguard (UK)', en: 'HM Coastguard (UK)' } },
      { ch: '11', location: { de: 'Niederl. Küstenwache / Schleuse', en: 'Netherlands coastguard / locks' } },
      { ch: '18', location: { de: 'Niederlande: Marinas Zeeland', en: 'Netherlands: Zeeland marinas' } },
      { ch: '31', location: { de: 'Niederlande: Wattenmeer-Schleuse', en: 'Netherlands: Waddensea locks' } },
      { ch: '10', location: { de: 'Belgien: Häfen / Schleusen', en: 'Belgium: ports / locks' } },
      { ch: '12', location: { de: 'Deutschland: Häfen / VTS allgemein', en: 'Germany: ports / VTS general' } },
      { ch: '09', location: { de: 'Deutschland: Marinas allgemein', en: 'Germany: marinas general' } },
    ],
  },
  {
    name: { de: 'Atlantik & Iberische Halbinsel', en: 'Atlantic & Iberian Peninsula' },
    channels: [
      { ch: '11', location: { de: 'Portugal: Häfen / Port control', en: 'Portugal: ports / port control' } },
      { ch: '12', location: { de: 'Spanien: Häfen / Port control', en: 'Spain: ports / port control' } },
      { ch: '09', location: { de: 'Spanien/Portugal: Marinas allgemein', en: 'Spain/Portugal: marinas general' } },
      { ch: '16', location: { de: 'Kanaren: Wachhören + SAR', en: 'Canaries: watch + SAR' } },
      { ch: '20', location: { de: 'Azoren: Porto control', en: 'Azores: Porto control' } },
    ],
  },
  {
    name: { de: 'Nordamerika', en: 'North America' },
    channels: [
      { ch: '16',  location: { de: 'Wachhören allgemein', en: 'General watch' } },
      { ch: '22A', location: { de: 'US Coast Guard Koordination (USA, USVI, Puerto Rico)', en: 'US Coast Guard coordination (USA, USVI, Puerto Rico)' } },
      { ch: '09',  location: { de: 'Marinas allgemein (USA)', en: 'Marinas general (USA)' } },
      { ch: '68',  location: { de: 'Yacht–Yacht allgemein (Ostküste USA)', en: 'Yacht–yacht general (US East Coast)' } },
      { ch: '12',  location: { de: 'Häfen & Port control', en: 'Ports & port control' } },
    ],
  },
  {
    name: { de: 'Karibik', en: 'Caribbean' },
    channels: [
      { ch: '16',  location: { de: 'Wachhören allgemein', en: 'General watch' } },
      { ch: '68',  location: { de: 'Yacht–Yacht allgemein (Karibik)', en: 'Yacht–yacht general (Caribbean)' } },
      { ch: '12',  location: { de: 'Häfen & Port control', en: 'Ports & port control' } },
      { ch: '09',  location: { de: 'Marinas allgemein', en: 'Marinas general' } },
    ],
  },
]

const WEATHER: { ch: string; service: { de: string; en: string }; freq?: string }[] = [
  { ch: 'WX1–WX7', service: { de: 'NOAA Wetterfunk (USA/Kanada)', en: 'NOAA Weather Radio (USA/Canada)' } },
  { ch: '67', service: { de: 'Wettermeldungen HM Coastguard (UK)', en: 'HM Coastguard weather (UK)' } },
  { ch: '79', service: { de: 'Wettermeldungen France CROSS', en: 'France CROSS weather broadcasts' } },
  { ch: '63', service: { de: 'Navtex / Küstenwetter Spanien', en: 'Spain coastal weather' } },
  { ch: '16', service: { de: 'Ansagen vor Wetterbericht (alle Regionen)', en: 'Weather announcements (all regions)' }, freq: 'Ankündigung auf 16' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function highlightClass(h?: 'red' | 'amber' | 'blue') {
  if (h === 'red')   return 'bg-red-50 dark:bg-red-950/40'
  if (h === 'amber') return 'bg-amber-50 dark:bg-amber-950/40'
  if (h === 'blue')  return 'bg-blue-50 dark:bg-blue-950/40'
  return ''
}

function chBadgeClass(h?: 'red' | 'amber' | 'blue') {
  if (h === 'red')   return 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300 font-bold'
  if (h === 'amber') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300 font-bold'
  if (h === 'blue')  return 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-bold'
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VHFReference() {
  const { i18n } = useTranslation()
  const lang = i18n.language.startsWith('de') ? 'de' : 'en'
  const [openRegion, setOpenRegion] = useState<number | null>(null)

  return (
    <div className="space-y-6">

      {/* International channels */}
      <Card padding={false}>
        <CardHeader
          title={lang === 'de' ? 'Internationale Kanäle' : 'International Channels'}
          icon={<Radio className="w-4 h-4" />}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-16">
                  {lang === 'de' ? 'Kanal' : 'Ch'}
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {lang === 'de' ? 'Verwendung' : 'Use'}
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide max-sm:hidden">
                  {lang === 'de' ? 'Wer' : 'Who'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {INTERNATIONAL.map(row => (
                <tr key={row.ch} className={highlightClass(row.highlight)}>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${chBadgeClass(row.highlight)}`}>
                      {row.ch}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">{row.use[lang]}</td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 max-sm:hidden">{row.who[lang]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Regional marina channels */}
      <Card padding={false}>
        <CardHeader
          title={lang === 'de' ? 'Marina-Kanäle nach Region' : 'Marina Channels by Region'}
          icon={<Radio className="w-4 h-4" />}
        />
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {REGIONS.map((region, idx) => (
            <div key={idx}>
              <button
                onClick={() => setOpenRegion(openRegion === idx ? null : idx)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="font-medium text-gray-800 dark:text-gray-200">{region.name[lang]}</span>
                <span className="text-gray-400 text-xs">{openRegion === idx ? '▲' : '▼'}</span>
              </button>
              {openRegion === idx && (
                <table className="w-full text-sm border-t border-gray-100 dark:border-gray-700">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {region.channels.map((row, i) => (
                      <tr key={i} className="bg-white dark:bg-gray-900">
                        <td className="px-4 py-2 w-16">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                            {row.ch}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{row.location[lang]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Weather broadcasts */}
      <Card padding={false}>
        <CardHeader
          title={lang === 'de' ? 'Wettermeldungen' : 'Weather Broadcasts'}
          icon={<Radio className="w-4 h-4" />}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {WEATHER.map((row, i) => (
                <tr key={i}>
                  <td className="px-4 py-2.5 w-24">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                      {row.ch}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">{row.service[lang]}</td>
                  <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500 text-xs max-sm:hidden">{row.freq ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
          {lang === 'de'
            ? 'Wetterdurchsagen werden auf Kanal 16 angekündigt und dann auf dem angegebenen Kanal gesendet.'
            : 'Weather broadcasts are announced on channel 16 then transmitted on the designated channel.'}
        </div>
      </Card>

    </div>
  )
}