import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import { PDFDocument } from 'pdf-lib'
import type { LogEntry, Ship, CrewMember, PassageEntry } from '../db/models'
import { formatCoordinate } from './geo'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 15

/** YYYY.MM.DD prefix for all export filenames */
function datePrefix(): string {
  return format(new Date(), 'yyyy.MM.dd')
}

function addHeader(doc: jsPDF, title: string, shipName: string) {
  const w = doc.internal.pageSize.getWidth()
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(title, MARGIN, 13)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`${shipName} · ${format(new Date(), 'yyyy-MM-dd HH:mm')} UTC`, w - MARGIN, 13, { align: 'right' })
  doc.setTextColor(0, 0, 0)
}

function addFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  doc.setFontSize(8)
  doc.setTextColor(128, 128, 128)
  doc.text(`Page ${pageNum} / ${totalPages}`, PAGE_W / 2, PAGE_H - 8, { align: 'center' })
  doc.text("Ship's Log – Maritime Logbook", MARGIN, PAGE_H - 8)
  doc.text(format(new Date(), 'yyyy-MM-dd'), PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' })
  doc.setTextColor(0, 0, 0)
}

// Safely extract base64 data from a data-URL or raw base64 string
function extractBase64(dataUrl: string): string {
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
}

function mimeToFormat(mimeType: string): string {
  if (mimeType.includes('png')) return 'PNG'
  if (mimeType.includes('gif')) return 'GIF'
  return 'JPEG'
}

function isPdfDataUrl(dataUrl: string): boolean {
  return dataUrl.startsWith('data:application/pdf')
}

/**
 * Embed an image into the PDF at the specified position.
 * Falls back to canvas-based JPEG conversion for formats jsPDF can't natively handle
 * (WebP, HEIC, AVIF, TIFF, progressive JPEG with EXIF, etc.).
 */
async function embedImage(
  doc: jsPDF,
  dataUrl: string,
  x: number, y: number, w: number, h: number
): Promise<void> {
  const mime = dataUrl.match(/^data:([^;]+);/)?.[1] || 'image/jpeg'

  // Always use canvas for JPEG so EXIF orientation is applied by the browser
  // before we render to the PDF (direct addImage ignores EXIF rotation).
  // For other formats we still try direct embedding first and fall back to canvas.
  const forceCanvas = mime === 'image/jpeg' || mime === 'image/jpg'

  if (!forceCanvas) {
    const fmt = mimeToFormat(mime)
    const base64 = extractBase64(dataUrl)
    try {
      doc.addImage(base64, fmt, x, y, w, h)
      return
    } catch {
      // Direct embedding failed — fall through to canvas
    }
  }

  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || 800
        canvas.height = img.naturalHeight || 600
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('canvas 2d context unavailable')); return }
        ctx.drawImage(img, 0, 0)
        const jpegBase64 = extractBase64(canvas.toDataURL('image/jpeg', 0.92))
        doc.addImage(jpegBase64, 'JPEG', x, y, w, h)
        resolve()
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => reject(new Error('image load failed'))
    img.src = dataUrl
  })
}

/**
 * Embed an image into an area, preserving the original aspect ratio and centering it.
 * Uses image natural dimensions to calculate the best fit within (areaW × areaH).
 */
async function embedImageFitArea(
  doc: jsPDF,
  dataUrl: string,
  areaX: number, areaY: number, areaW: number, areaH: number
): Promise<void> {
  const { w: nw, h: nh } = await new Promise<{ w: number; h: number }>(resolve => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 800, h: img.naturalHeight || 600 })
    img.onerror = () => resolve({ w: 800, h: 600 })
    img.src = dataUrl
  })
  const ratio = nw / nh
  let imgW = areaW
  let imgH = imgW / ratio
  if (imgH > areaH) { imgH = areaH; imgW = imgH * ratio }
  const x = areaX + (areaW - imgW) / 2
  const y = areaY + (areaH - imgH) / 2
  await embedImage(doc, dataUrl, x, y, imgW, imgH)
}

/** Merge additional PDF pages (base64 data URLs) into an existing PDF. */
async function mergePDFPages(mainBytes: ArrayBuffer, pdfDataUrls: string[]): Promise<Uint8Array> {
  const mainDoc = await PDFDocument.load(mainBytes)
  for (const dataUrl of pdfDataUrls) {
    try {
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const attachedDoc = await PDFDocument.load(bytes)
      const pages = await mainDoc.copyPages(attachedDoc, attachedDoc.getPageIndices())
      pages.forEach(page => mainDoc.addPage(page))
    } catch (e) {
      console.warn('Could not merge PDF attachment:', e)
    }
  }
  return mainDoc.save()
}

/**
 * Save PDF bytes to disk.
 * - Tauri (macOS/Windows/Linux app): shows a native save dialog, then writes via Rust command.
 * - Browser/PWA: standard Blob URL download.
 */
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function savePdfBytes(bytes: ArrayBuffer, filename: string): Promise<void> {
  if (isTauri) {
    const [{ save }, { invoke }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/api/core'),
    ])
    const path = await save({
      defaultPath: filename,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (!path) return // user cancelled
    await invoke('save_file', { path, data: Array.from(new Uint8Array(bytes)) })
  } else {
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}

/**
 * Save a jsPDF document, merging any PDF attachments at the end via pdf-lib.
 */
async function saveWithMerge(doc: jsPDF, filename: string, pdfDataUrls: string[]): Promise<void> {
  const mainBytes = doc.output('arraybuffer')
  if (pdfDataUrls.length === 0) {
    await savePdfBytes(mainBytes, filename)
    return
  }
  const mergedBytes = await mergePDFPages(mainBytes, pdfDataUrls)
  await savePdfBytes(mergedBytes.buffer as ArrayBuffer, filename)
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/**
 * Append DocumentAttachments as extra pages to the current doc.
 * - Images → embedded full-page with correct aspect ratio
 * - PDFs   → collected and returned as data URLs for merging via pdf-lib
 * Returns an array of PDF data URLs that must be merged via saveWithMerge().
 */
async function appendAttachmentPages(
  doc: jsPDF,
  attachments: Array<{ name: string; type: string; data: string; size: number; uploadedAt: string }>,
  headerTitle: string,
  ownerName: string
): Promise<string[]> {
  const pdfDataUrls: string[] = []
  for (const att of attachments) {
    if (isPdfDataUrl(att.data) || att.type === 'application/pdf') {
      // Collect PDF for later merging – no placeholder page needed
      pdfDataUrls.push(att.data)
    } else if (att.type.startsWith('image/') || att.data.startsWith('data:image/')) {
      doc.addPage()
      addHeader(doc, headerTitle, ownerName)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(att.name, MARGIN, 28)
      doc.setFont('helvetica', 'normal')
      try {
        await embedImageFitArea(doc, att.data, MARGIN, 33, PAGE_W - MARGIN * 2, PAGE_H - 53)
      } catch {
        doc.setFontSize(9)
        doc.text('(Image could not be embedded)', MARGIN, 40)
      }
      const pageCount = (doc as jsPDF & { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages()
      addFooter(doc, pageCount, pageCount)
    }
    // Other types: silently skip
  }
  return pdfDataUrls
}

const MOORING_PDF: Record<string, string> = {
  anchored: 'At Anchor',
  moored_marina: 'Marina',
  moored_buoy: 'Buoy',
  moored_alongside: 'Alongside',
}

function sailSummary(e: LogEntry): string {
  const parts: string[] = []
  if (e.mainsailState && e.mainsailState !== 'none') {
    parts.push(e.mainsailState === 'full' ? 'Main' : `Main(${e.mainsailState})`)
  }
  if (e.genoa && e.genoa !== 'none') {
    parts.push(e.genoa === 'full' ? 'Genoa' : `Genoa(${e.genoa})`)
  }
  if (e.staysail && e.staysail !== 'none') {
    parts.push(e.staysail === 'full' ? 'Stay' : `Stay(${e.staysail})`)
  }
  if (!e.genoa && !e.staysail && e.headsail && e.headsail !== 'none') {
    parts.push(e.headsail === 'genoa' ? 'Genoa' : 'Stay')
  }
  if (e.lightSail && e.lightSail !== 'none') {
    const ls: Record<string, string> = { code0: 'Code 0', gennaker: 'Gennaker', parasail: 'Spi' }
    parts.push(ls[e.lightSail] ?? e.lightSail)
  }
  if (parts.length) return parts.join('+')
  if (e.sailConfig) return `${e.sailConfig}${e.reefPoints ? ` R${e.reefPoints}` : ''}`
  return '—'
}

// ── Ship's Log / Logbuch ──────────────────────────────────────────────────────
export async function generateLogbookPDF(
  entries: LogEntry[],
  ship: Ship | null | undefined,
  passages?: PassageEntry[]
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' })
  const PAGE_W_L = 297 // landscape width
  const PAGE_H_L = 210 // landscape height
  const shipName = ship?.name ?? 'Unknown Vessel'

  addHeader(doc, "SHIP'S LOG", shipName)

  // Ship identity sub-header
  let startY = 26
  if (ship) {
    doc.setFontSize(7.5)
    doc.setTextColor(60, 80, 100)
    const parts = [
      ship.callSign ? `Call Sign: ${ship.callSign}` : null,
      ship.mmsi ? `MMSI: ${ship.mmsi}` : null,
      ship.flag ? `Flag: ${ship.flag}` : null,
      ship.homePort ? `Home Port: ${ship.homePort}` : null,
    ].filter(Boolean).join('  |  ')
    if (parts) {
      doc.text(parts, MARGIN, startY)
      startY = 32
    }
    doc.setTextColor(0, 0, 0)
  }

  const columns = ['Date/Time', 'Position', 'COG/CMG', 'SOG/STW', 'Dist.', 'Wind', 'Baro', 'Sails', 'Engine', 'Notes']

  function entryRow(e: LogEntry) {
    return [
      `${e.date}\n${e.time} UTC`,
      `${formatCoordinate(e.latitude)}\n${formatCoordinate(e.longitude)}`,
      `${e.courseTrue != null ? String(Math.round(e.courseTrue)).padStart(3, '0') : '---'}°T\n${e.courseMagnetic != null ? String(Math.round(e.courseMagnetic)).padStart(3, '0') : '---'}°M`,
      `${e.speedOverGround != null ? e.speedOverGround.toFixed(1) : '—'} kn\n${e.speedThroughWater != null ? e.speedThroughWater.toFixed(1) : '—'} kn`,
      `${e.distanceSinceLastEntry.toFixed(1)} nm`,
      `Bft ${e.windBeaufort}\n${e.windTrueDirection != null ? String(Math.round(e.windTrueDirection)).padStart(3, '0') : '---'}°`,
      `${e.baroPressureHPa != null ? Math.round(e.baroPressureHPa) : '—'} hPa\n${e.pressureTrend ?? ''}`,
      sailSummary(e),
      e.mooringStatus && e.mooringStatus !== 'underway'
        ? MOORING_PDF[e.mooringStatus] + (e.engineOn ? '\nMotor' : '')
        : e.engineOn ? `On${e.engineHoursTotal != null ? `\n${e.engineHoursTotal.toFixed(0)} h` : ''}` : 'Sailing',
      e.notes,
    ]
  }

  const tableBase = {
    styles: { fontSize: 7, cellPadding: 2, lineWidth: 0.1, lineColor: [200, 200, 200] as [number, number, number] },
    headStyles: { fillColor: [220, 220, 220] as [number, number, number], textColor: [30, 30, 30] as [number, number, number], fontStyle: 'bold' as const, fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
    columnStyles: { 9: { cellWidth: 45 } },
    margin: { top: 25, left: MARGIN, right: MARGIN },
    didDrawPage: (data: { pageNumber: number }) => {
      addFooter(doc, data.pageNumber, (doc as jsPDF & { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages())
    },
  }

  if (passages && passages.length > 0) {
    const sortedPassages = [...passages].sort((a, b) =>
      a.departureDate.localeCompare(b.departureDate)
    )

    let isFirst = true
    for (const passage of sortedPassages) {
      const passageEntries = entries
        .filter(e => e.passageId === passage.id)
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
      if (passageEntries.length === 0) continue

      let headerY: number
      if (isFirst) {
        headerY = startY
      } else {
        const prevFinalY: number = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY
        headerY = prevFinalY + 8
        if (headerY > PAGE_H_L - 40) {
          doc.addPage()
          addHeader(doc, "SHIP'S LOG (cont.)", shipName)
          headerY = 28
        }
      }

      // Passage section header bar
      doc.setFillColor(241, 245, 249)
      doc.rect(MARGIN, headerY - 4, PAGE_W_L - MARGIN * 2, 9, 'F')
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(15, 23, 42)
      const passageLabel = `${passage.departurePort} (${passage.departureCountry}) -> ${passage.arrivalPort} (${passage.arrivalCountry})   ·   ${passage.departureDate} – ${passage.arrivalDate}   ·   ${passageEntries.length} entries`
      doc.text(passageLabel, MARGIN + 2, headerY + 1)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(0, 0, 0)

      autoTable(doc, {
        head: [columns],
        body: passageEntries.map(entryRow),
        startY: headerY + 6,
        ...tableBase,
      })

      isFirst = false
    }

    // Entries without a matching passage
    const passageIds = new Set(passages.map(p => p.id))
    const orphaned = entries
      .filter(e => !e.passageId || !passageIds.has(e.passageId))
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    if (orphaned.length > 0) {
      const prevFinalY: number = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY
      let headerY = prevFinalY + 8
      if (headerY > PAGE_H_L - 40) {
        doc.addPage()
        addHeader(doc, "SHIP'S LOG (cont.)", shipName)
        headerY = 28
      }
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(15, 23, 42)
      doc.text(`Additional entries (${orphaned.length})`, MARGIN, headerY)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(0, 0, 0)
      autoTable(doc, {
        head: [columns],
        body: orphaned.map(entryRow),
        startY: headerY + 5,
        ...tableBase,
      })
    }
  } else {
    // Flat list (no passage data)
    autoTable(doc, {
      head: [columns],
      body: entries.map(entryRow),
      startY,
      ...tableBase,
    })
  }

  await savePdfBytes(doc.output('arraybuffer'), `${datePrefix()} - Ships Log.pdf`)
}

// ── Single Passage PDF / Passenreport ────────────────────────────────────────
export async function generatePassagePDF(
  passage: PassageEntry,
  entries: LogEntry[],
  ship?: Ship | null
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' })
  const PAGE_W_L = 297
  const PAGE_H_L = 210
  const shipName = ship?.name ?? 'Unknown Vessel'
  const sorted = [...entries].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))

  const title = `${passage.departurePort} -> ${passage.arrivalPort}`
  addHeader(doc, `PASSAGE REPORT · ${title}`, shipName)

  // Passage info block (dates + route only — detailed stats are in the statistics section below)
  let y = 27

  // ── Structured voyage info block ─────────────────────────────────────────────
  const totalNm = sorted.reduce((s, e) => s + (e.distanceSinceLastEntry ?? 0), 0)
  const maxWind = sorted.length ? Math.max(...sorted.map(e => e.windBeaufort)) : 0
  const withSOG = sorted.filter(e => e.speedOverGround != null)
  const avgSOG = withSOG.length ? withSOG.reduce((s, e) => s + (e.speedOverGround ?? 0), 0) / withSOG.length : 0
  const half = PAGE_W_L / 2

  doc.setFillColor(241, 245, 249)
  doc.rect(MARGIN, y - 1, PAGE_W_L - MARGIN * 2, 22, 'F')

  doc.setFontSize(7.5)
  // Left column: Route
  doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 100, 120)
  doc.text('FROM:', MARGIN + 3, y + 5)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42)
  doc.text(
    `${passage.departurePort}${passage.departureCountry ? '  (' + passage.departureCountry + ')' : ''}   ${passage.departureDate} ${passage.departureTime} UTC`,
    MARGIN + 20, y + 5
  )
  doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 100, 120)
  doc.text('TO:', MARGIN + 3, y + 13)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42)
  doc.text(
    `${passage.arrivalPort}${passage.arrivalCountry ? '  (' + passage.arrivalCountry + ')' : ''}   ${passage.arrivalDate} ${passage.arrivalTime} UTC`,
    MARGIN + 20, y + 13
  )
  // Right column: Vessel
  const VESSEL_VAL_X = half + 32   // aligned to the widest label "MMSI / CALL:"
  if (ship) {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 100, 120)
    doc.text('VESSEL:', half + 3, y + 5)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42)
    doc.text(ship.name, VESSEL_VAL_X, y + 5)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 100, 120)
    doc.text('MMSI / CALL:', half + 3, y + 13)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 23, 42)
    doc.text(`${ship.mmsi || '—'}  /  ${ship.callSign || '—'}`, VESSEL_VAL_X, y + 13)
  }
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  y += 26

  if (passage.notes) {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'italic')
    doc.text(passage.notes, MARGIN, y, { maxWidth: PAGE_W_L - MARGIN * 2 })
    doc.setFont('helvetica', 'normal')
    y += 5
  }

  // ── Statistics section ──────────────────────────────────────────────────────
  const nmSail   = sorted.filter(e => !e.engineOn).reduce((s, e) => s + (e.distanceSinceLastEntry ?? 0), 0)
  const nmMotor  = sorted.filter(e =>  e.engineOn).reduce((s, e) => s + (e.distanceSinceLastEntry ?? 0), 0)
  const sailPct  = totalNm > 0 ? Math.round(nmSail  / totalNm * 100) : 0
  const motorPct = totalNm > 0 ? Math.round(nmMotor / totalNm * 100) : 0
  const maxSOG   = withSOG.length ? Math.max(...withSOG.map(e => e.speedOverGround ?? 0)) : 0
  const maxSeaState = sorted.length ? Math.max(...sorted.map(e => e.seaStateBeaufort)) : 0
  const avgBaro  = sorted.length ? Math.round(sorted.reduce((s, e) => s + e.baroPressureHPa, 0) / sorted.length) : 0

  // Passage duration
  let durationStr = '—'
  try {
    const dep = new Date(`${passage.departureDate}T${passage.departureTime || '00:00'}:00Z`)
    const arr = new Date(`${passage.arrivalDate}T${passage.arrivalTime || '00:00'}:00Z`)
    const diffH = Math.round((arr.getTime() - dep.getTime()) / 3_600_000)
    if (diffH > 0) durationStr = diffH >= 24 ? `${Math.floor(diffH / 24)}d ${diffH % 24}h` : `${diffH}h`
  } catch { /* ignore */ }

  // Beaufort distribution
  const bftCounts = new Array(13).fill(0)
  sorted.forEach(e => { if (e.windBeaufort >= 0 && e.windBeaufort <= 12) bftCounts[e.windBeaufort]++ })

  y += 3

  // Section header bar
  doc.setFillColor(225, 225, 225)
  doc.rect(MARGIN, y - 1, PAGE_W_L - MARGIN * 2, 7, 'F')
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('PASSAGE STATISTICS', MARGIN + 2, y + 4)
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  y += 9

  // Stats grid (3 columns × 3 rows via autoTable – no head, zebra fill)
  autoTable(doc, {
    body: [
      [
        { content: 'Total Distance', styles: { fontStyle: 'bold' as const } }, `${totalNm.toFixed(1)} nm`,
        { content: 'Under Sail',     styles: { fontStyle: 'bold' as const } }, `${nmSail.toFixed(1)} nm  (${sailPct} %)`,
        { content: 'Under Engine',   styles: { fontStyle: 'bold' as const } }, `${nmMotor.toFixed(1)} nm  (${motorPct} %)`,
      ],
      [
        { content: 'Avg. SOG',       styles: { fontStyle: 'bold' as const } }, `${avgSOG.toFixed(1)} kn`,
        { content: 'Max. SOG',       styles: { fontStyle: 'bold' as const } }, `${maxSOG.toFixed(1)} kn`,
        { content: 'Duration',       styles: { fontStyle: 'bold' as const } }, durationStr,
      ],
      [
        { content: 'Max. Wind',      styles: { fontStyle: 'bold' as const } }, `Bft ${maxWind}`,
        { content: 'Max. Sea State', styles: { fontStyle: 'bold' as const } }, `Douglas ${maxSeaState}`,
        { content: 'Avg. Pressure',  styles: { fontStyle: 'bold' as const } }, `${avgBaro} hPa`,
      ],
    ],
    startY: y,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, fillColor: [248, 250, 252] as [number, number, number], lineColor: [220, 220, 220] as [number, number, number], lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 52 },
      2: { cellWidth: 28 },
      3: { cellWidth: 52 },
      4: { cellWidth: 26 },
      5: { cellWidth: 'auto' as const },
    },
    margin: { left: MARGIN, right: MARGIN },
  })
  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4

  // Beaufort distribution table
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(60, 60, 60)
  doc.text('Wind Distribution (Beaufort)', MARGIN, y + 1)
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  y += 4

  autoTable(doc, {
    head: [['', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']],
    body: [['Entries', ...bftCounts.map((c: number) => c > 0 ? String(c) : '—')]],
    startY: y,
    styles: { fontSize: 7, cellPadding: 1.5, halign: 'center' as const, lineColor: [200, 200, 200] as [number, number, number], lineWidth: 0.1 },
    headStyles: { fillColor: [220, 220, 220] as [number, number, number], textColor: [30, 30, 30] as [number, number, number], fontSize: 7, fontStyle: 'bold' as const, halign: 'center' as const },
    columnStyles: {
      0: { fontStyle: 'bold' as const, halign: 'left' as const, fillColor: [241, 245, 249] as [number, number, number], cellWidth: 20 },
    },
    margin: { left: MARGIN, right: MARGIN },
  })
  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 5

  // ── Log table ─────────────────────────────────────────────────────────────
  const columns = ['Date/Time', 'Position', 'COG/CMG', 'SOG/STW', 'Dist.', 'Wind', 'Baro', 'Sails', 'Engine', 'Watch', 'Notes']

  function entryRow(e: LogEntry) {
    const watchParts = [
      ...(e.watchOfficer ? [e.watchOfficer] : []),
      ...(e.crewOnWatch ?? []).filter(c => c !== e.watchOfficer),
    ]
    return [
      `${e.date}\n${e.time} UTC`,
      `${formatCoordinate(e.latitude)}\n${formatCoordinate(e.longitude)}`,
      `${e.courseTrue != null ? String(Math.round(e.courseTrue)).padStart(3, '0') : '---'}°T\n${e.courseMagnetic != null ? String(Math.round(e.courseMagnetic)).padStart(3, '0') : '---'}°M`,
      `${e.speedOverGround != null ? e.speedOverGround.toFixed(1) : '—'} kn\n${e.speedThroughWater != null ? e.speedThroughWater.toFixed(1) : '—'} kn`,
      `${e.distanceSinceLastEntry.toFixed(1)} nm`,
      `Bft ${e.windBeaufort}\n${e.windTrueDirection != null ? String(Math.round(e.windTrueDirection)).padStart(3, '0') : '---'}°`,
      `${e.baroPressureHPa != null ? Math.round(e.baroPressureHPa) : '—'} hPa`,
      sailSummary(e),
      e.mooringStatus && e.mooringStatus !== 'underway'
        ? MOORING_PDF[e.mooringStatus] + (e.engineOn ? '\nMotor' : '')
        : e.engineOn ? `On${e.engineHoursTotal != null ? `\n${e.engineHoursTotal.toFixed(0)} h` : ''}` : 'Sailing',
      watchParts.length > 0 ? watchParts.join('\n') : '—',
      e.notes,
    ]
  }

  autoTable(doc, {
    head: [columns],
    body: sorted.map(entryRow),
    startY: y,
    styles: { fontSize: 7, cellPadding: 2, lineWidth: 0.1, lineColor: [200, 200, 200] as [number, number, number] },
    headStyles: { fillColor: [220, 220, 220] as [number, number, number], textColor: [30, 30, 30] as [number, number, number], fontStyle: 'bold' as const, fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
    columnStyles: { 9: { cellWidth: 26 }, 10: { cellWidth: 38 } },
    margin: { top: 25, left: MARGIN, right: MARGIN },
    didDrawPage: (data: { pageNumber: number }) => {
      if (data.pageNumber > 1) addHeader(doc, `PASSAGE REPORT · ${title} (cont.)`, shipName)
      addFooter(doc, data.pageNumber, (doc as jsPDF & { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages())
    },
  })

  const safeName = `${passage.departurePort}-${passage.arrivalPort}`.replace(/[^a-zA-Z0-9\-]/g, '_')
  await savePdfBytes(doc.output('arraybuffer'), `${datePrefix()} - Passage ${safeName}.pdf`)
}

// ── Ship Dossier / Schiffsakte ────────────────────────────────────────────────
export async function generateShipDossierPDF(ship: Ship, includeAttachments = true): Promise<void> {
  const doc = new jsPDF({ format: 'a4' })

  addHeader(doc, 'SHIP DOSSIER', ship.name)

  let y = 30

  function section(title: string) {
    doc.setFillColor(241, 245, 249)
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 7, 'F')
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(title, MARGIN + 2, y + 5)
    doc.setFont('helvetica', 'normal')
    y += 10
  }

  function row(label: string, value: string) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(label + ':', MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value || '-', MARGIN + 60, y)
    y += 6
  }

  section('VESSEL IDENTITY')
  row('Name', ship.name)
  row('Type', ship.type)
  row('Manufacturer', `${ship.manufacturer} ${ship.model}`)
  row('Year Built', String(ship.yearBuilt || '-'))
  row('Flag', ship.flag)
  row('Home Port', ship.homePort)
  y += 3

  section('REGISTRATION')
  row('Reg. Number', ship.registrationNumber)
  row('Country', ship.registrationCountry)
  row('MMSI', ship.mmsi)
  row('Call Sign', ship.callSign)
  y += 3

  section('DIMENSIONS')
  row('LOA', `${ship.loaMeters} m`)
  row('Beam', `${ship.beamMeters} m`)
  row('Draft', `${ship.draftMeters} m`)
  row('Displacement', `${ship.displacementTons} t`)
  row('Sail Area', `${ship.sailAreaSqm} m²`)
  y += 3

  section('ENGINE & TANKS')
  row('Engine Type', ship.engineType)
  row('Power', `${ship.enginePowerKw} kW`)
  row('Fuel', `${ship.fuelType}, ${ship.fuelCapacityL} L`)
  row('Water', `${ship.waterCapacityL} L`)
  y += 3

  section('INSURANCE')
  row('Company', ship.insuranceCompany)
  row('Policy Nr.', ship.insurancePolicyNr)
  row('Expiry', ship.insuranceExpiry)

  addFooter(doc, 1, 1)

  const pdfAttachments: string[] = []
  if (includeAttachments && ship.documents?.length) {
    const pdfs = await appendAttachmentPages(doc, ship.documents, 'SHIP DOSSIER – DOCUMENT', ship.name)
    pdfAttachments.push(...pdfs)
  }

  await saveWithMerge(doc, `${datePrefix()} - Ship Dossier ${ship.name}.pdf`, pdfAttachments)
}

// ── Crew List / Crewliste ─────────────────────────────────────────────────────
export async function generateCrewListPDF(
  crew: CrewMember[],
  ship: Ship | null | undefined,
  includeAttachments = true
): Promise<void> {
  const doc = new jsPDF({ format: 'a4' })
  const shipName = ship?.name ?? 'Unknown Vessel'

  addHeader(doc, 'CREW LIST', shipName)

  doc.setFontSize(9)
  doc.text(`Vessel: ${shipName}`, MARGIN, 28)
  if (ship?.mmsi) doc.text(`MMSI: ${ship.mmsi}`, PAGE_W / 2, 28)
  doc.text(`Date: ${format(new Date(), 'yyyy-MM-dd')}`, PAGE_W - MARGIN, 28, { align: 'right' })

  const tableData = crew.map((m, i) => [
    String(i + 1),
    `${m.lastName}, ${m.firstName}`,
    m.dateOfBirth,
    m.nationality,
    m.passportNumber,
    m.passportExpiry,
    m.role === 'skipper' ? 'Skipper' : m.role === 'crew' ? 'Crew' : 'Passenger',
    m.onBoardFrom,
    m.onBoardTo ?? 'ongoing',
  ])

  autoTable(doc, {
    head: [['#', 'Name', 'Date of Birth', 'Nationality', 'Passport Nr.', 'Expiry', 'Role', 'On Board', 'Until']],
    body: tableData,
    startY: 35,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [220, 220, 220], textColor: [30, 30, 30], fontStyle: 'bold', fontSize: 8 },
    margin: { left: MARGIN, right: MARGIN },
  })

  // Signature block
  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Skipper Signature:', MARGIN, finalY + 20)
  doc.line(MARGIN, finalY + 35, 100, finalY + 35)
  doc.setFont('helvetica', 'normal')
  doc.text('Date: _______________', MARGIN + 110, finalY + 35)

  addFooter(doc, 1, 1)

  const pdfPassports: string[] = []
  if (includeAttachments) {
    for (const member of crew.filter(m => m.passportCopy)) {
      if (isPdfDataUrl(member.passportCopy!)) {
        pdfPassports.push(member.passportCopy!)
      } else {
        doc.addPage()
        addHeader(doc, 'CREW LIST – TRAVEL DOCUMENT', shipName)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text(`${member.firstName} ${member.lastName}`, MARGIN, 28)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text(
          `Passport Nr.: ${member.passportNumber || '—'}  ·  Expiry: ${member.passportExpiry || '—'}  ·  Nationality: ${member.nationality}`,
          MARGIN, 34
        )
        try {
          await embedImageFitArea(doc, member.passportCopy!, MARGIN, 40, PAGE_W - MARGIN * 2, PAGE_H - 55)
        } catch {
          doc.setFontSize(9)
          doc.text('(Image could not be embedded)', MARGIN, 45)
        }
        const pageCount = (doc as jsPDF & { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages()
        addFooter(doc, pageCount, pageCount)
      }
    }
  }

  await saveWithMerge(doc, `${datePrefix()} - Crew List.pdf`, pdfPassports)
}

// ── Customs Declaration / Einklarierung ──────────────────────────────────────
export async function generateCustomsDeclarationPDF(
  ship: Ship,
  crew: CrewMember[],
  passage: PassageEntry | null | undefined,
  includeAttachments = true
): Promise<void> {
  const doc = new jsPDF({ format: 'a4' })

  addHeader(doc, 'CUSTOMS DECLARATION', ship.name)

  let y = 35

  function sectionTitle(title: string) {
    doc.setFillColor(241, 245, 249)
    doc.rect(MARGIN, y - 4, PAGE_W - MARGIN * 2, 8, 'F')
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(title, MARGIN + 2, y + 1)
    doc.setFont('helvetica', 'normal')
    y += 8
  }

  function field(label: string, value: string, x?: number) {
    const xPos = x ?? MARGIN
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text(label + ':', xPos, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(value || '_____________________', xPos, y + 5)
    if (!x) y += 12
  }

  sectionTitle('VESSEL DETAILS')
  field('Vessel Name', ship.name, MARGIN)
  field('Type', ship.type, PAGE_W / 2)
  y += 12
  field('Flag', ship.flag, MARGIN)
  field('MMSI', ship.mmsi, PAGE_W / 2)
  y += 12
  field('Call Sign', ship.callSign, MARGIN)
  field('Reg. No.', ship.registrationNumber, PAGE_W / 2)
  y += 15

  sectionTitle('VOYAGE DETAILS')
  if (passage) {
    field('Port of Departure', `${passage.departurePort}, ${passage.departureCountry}`)
    field('Date', passage.departureDate)
    field('Port of Arrival', `${passage.arrivalPort}, ${passage.arrivalCountry}`)
    field('Date', passage.arrivalDate)
  } else {
    field('Port of Departure', '')
    field('Departure Date', '')
    field('Port of Arrival', '')
    field('Arrival Date', '')
  }
  y += 5

  sectionTitle('CREW MANIFEST')
  autoTable(doc, {
    head: [['#', 'Name', 'Date of Birth', 'Nationality', 'Passport Nr.', 'Role']],
    body: crew.map((m, i) => [
      String(i + 1),
      `${m.lastName}, ${m.firstName}`,
      m.dateOfBirth,
      m.nationality,
      m.passportNumber,
      m.role,
    ]),
    startY: y,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [220, 220, 220], textColor: [30, 30, 30], fontStyle: 'bold', fontSize: 8 },
    margin: { left: MARGIN, right: MARGIN },
  })

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 240

  // Declaration
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.text(
    'I hereby declare that all information provided is correct and complete.',
    MARGIN, finalY + 15, { maxWidth: PAGE_W - MARGIN * 2 }
  )
  doc.setFont('helvetica', 'normal')
  doc.text('Date: _______________', MARGIN, finalY + 30)
  doc.text('Skipper Signature: ___________________________', MARGIN + 70, finalY + 30)

  addFooter(doc, 1, 1)

  const pdfAttachments: string[] = []
  if (includeAttachments) {
    // Append crew passport copies
    for (const member of crew.filter(m => m.passportCopy)) {
      if (isPdfDataUrl(member.passportCopy!)) {
        pdfAttachments.push(member.passportCopy!)
      } else {
        doc.addPage()
        addHeader(doc, 'CUSTOMS DECLARATION – TRAVEL DOCUMENT', ship.name)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text(`${member.firstName} ${member.lastName}`, MARGIN, 28)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text(
          `Passport Nr.: ${member.passportNumber || '—'}  ·  Expiry: ${member.passportExpiry || '—'}  ·  Nationality: ${member.nationality}  ·  Role: ${member.role}`,
          MARGIN, 34
        )
        try {
          await embedImageFitArea(doc, member.passportCopy!, MARGIN, 40, PAGE_W - MARGIN * 2, PAGE_H - 55)
        } catch {
          doc.setFontSize(9)
          doc.text('(Image could not be embedded)', MARGIN, 45)
        }
        const pageCount = (doc as jsPDF & { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages()
        addFooter(doc, pageCount, pageCount)
      }
    }

    // Append ship documents (registration certificate, insurance, etc.)
    if (ship.documents?.length) {
      const pdfs = await appendAttachmentPages(doc, ship.documents, 'CUSTOMS DECLARATION – DOCUMENT', ship.name)
      pdfAttachments.push(...pdfs)
    }
  }

  await saveWithMerge(doc, `${datePrefix()} - Customs Declaration.pdf`, pdfAttachments)
}
