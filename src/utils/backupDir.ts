// ── File System Access API – persisted backup directory ───────────────────────
// Stores a FileSystemDirectoryHandle in a tiny IndexedDB so it survives page
// reloads without requiring the user to pick the folder again each time.
// Backups are created as a single ZIP file containing backup.json and all
// attachments in an Attachments/ subfolder structure.

import JSZip from 'jszip'

const IDB_NAME = 'logbuch-handles'
const IDB_VER = 1
const STORE = 'handles'
const KEY_HANDLE = 'backupDir'
const KEY_LABEL = 'backupDirLabel'

// Minimal typings for File System Access API
interface FSWritable {
  write(d: string | Blob | ArrayBuffer): Promise<void>
  close(): Promise<void>
}
interface FSFileHandle {
  createWritable(): Promise<FSWritable>
}
interface FSDirectoryHandle {
  name: string
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FSFileHandle>
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FSDirectoryHandle>
  requestPermission(opts: { mode: 'readwrite' | 'read' }): Promise<PermissionState>
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
function openHandlesDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VER)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openHandlesDB()
    return new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result as T) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openHandlesDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbDel(key: string): Promise<void> {
  const db = await openHandlesDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── ZIP creation ──────────────────────────────────────────────────────────────

function dataUrlToBlob(data: string, mimeType: string): Blob {
  const base64 = data.includes(',') ? data.split(',')[1] : data
  const bytes = atob(base64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mimeType || 'application/octet-stream' })
}

function safeName(name: string): string {
  return name.replace(/[^\w\-. ]/g, '_').trim() || 'attachment'
}

/**
 * Build a ZIP archive from the exported JSON data.
 * Structure:
 *   backup.json
 *   Attachments/Ship/<filename>
 *   Attachments/Crew/<LastName_FirstName_passport.jpg>
 *   Attachments/Log/<date_filename>
 */
async function createBackupZip(json: string): Promise<Blob> {
  const zip = new JSZip()
  zip.file('backup.json', json)

  let backup: Record<string, unknown>
  try { backup = JSON.parse(json) } catch {
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  }

  const data = (backup.data ?? {}) as Record<string, unknown[]>

  // Ship documents
  const ships = Array.isArray(data.ship) ? data.ship : []
  for (const ship of ships as Array<{ documents?: Array<{ name: string; type: string; data: string }> }>) {
    for (const doc of ship.documents ?? []) {
      try {
        zip.file(`Attachments/Ship/${safeName(doc.name)}`, dataUrlToBlob(doc.data, doc.type))
      } catch { /* skip */ }
    }
  }

  // Crew passport copies
  const crew = Array.isArray(data.crew) ? data.crew : []
  for (const m of crew as Array<{ firstName: string; lastName: string; passportCopy?: string }>) {
    if (m.passportCopy) {
      try {
        zip.file(
          `Attachments/Crew/${safeName(`${m.lastName}_${m.firstName}_passport.jpg`)}`,
          dataUrlToBlob(m.passportCopy, 'image/jpeg')
        )
      } catch { /* skip */ }
    }
  }

  // Log entry attachments
  const logEntries = Array.isArray(data.logEntries) ? data.logEntries : []
  for (const entry of logEntries as Array<{ date: string; attachments?: Array<{ name: string; type: string; data: string }> }>) {
    for (const att of entry.attachments ?? []) {
      try {
        zip.file(
          `Attachments/Log/${safeName(`${entry.date}_${att.name}`)}`,
          dataUrlToBlob(att.data, att.type)
        )
      } catch { /* skip */ }
    }
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns the stored directory handle (or null if none saved). */
export async function getBackupDirHandle(): Promise<FSDirectoryHandle | null> {
  return idbGet<FSDirectoryHandle>(KEY_HANDLE)
}

/** Returns the display label (folder name) of the stored backup directory. */
export async function getBackupDirLabel(): Promise<string | null> {
  return idbGet<string>(KEY_LABEL)
}

/** Persist a chosen directory handle so future auto-backups can use it. */
export async function setBackupDir(handle: FSDirectoryHandle): Promise<void> {
  await idbSet(KEY_HANDLE, handle)
  await idbSet(KEY_LABEL, handle.name)
}

/** Remove the stored backup directory. */
export async function clearBackupDir(): Promise<void> {
  await idbDel(KEY_HANDLE)
  await idbDel(KEY_LABEL)
}

/**
 * Silent save — creates a ZIP backup and writes it to the stored directory
 * handle, or falls back to anchor download.
 * Safe to call without a user gesture (auto-backup).
 */
export async function saveBackupFile(json: string, filename: string): Promise<void> {
  const zipBlob = await createBackupZip(json)
  const handle = await getBackupDirHandle()
  if (handle) {
    try {
      const perm = await handle.requestPermission({ mode: 'readwrite' })
      if (perm === 'granted') {
        const fh = await handle.getFileHandle(filename, { create: true })
        const w = await fh.createWritable()
        await w.write(zipBlob)
        await w.close()
        return
      }
    } catch { /* fall through */ }
  }
  // Fallback: anchor download
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Interactive save — tries stored directory, then showSaveFilePicker, then
 * anchor download as last resort.
 * Requires a user gesture (manual backup button).
 */
export async function saveBackupFileWithPicker(json: string, filename: string): Promise<void> {
  const zipBlob = await createBackupZip(json)

  // 1) Stored directory handle
  const handle = await getBackupDirHandle()
  if (handle) {
    try {
      const perm = await handle.requestPermission({ mode: 'readwrite' })
      if (perm === 'granted') {
        const fh = await handle.getFileHandle(filename, { create: true })
        const w = await fh.createWritable()
        await w.write(zipBlob)
        await w.close()
        return
      }
    } catch { /* fall through */ }
  }

  // 2) showSaveFilePicker (Chrome / Edge desktop)
  if ('showSaveFilePicker' in window) {
    try {
      const fh = await (
        window as Window & {
          showSaveFilePicker(o: object): Promise<FSFileHandle>
        }
      ).showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'ZIP Backup', accept: { 'application/zip': ['.zip'] } }],
      })
      const w = await fh.createWritable()
      await w.write(zipBlob)
      await w.close()
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }

  // 3) Fallback anchor download
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
