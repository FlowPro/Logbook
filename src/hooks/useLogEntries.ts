import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { LogEntry } from '../db/models'

export function useLogEntries(limit?: number) {
  const entries = useLiveQuery(async () => {
    const query = db.logEntries.orderBy('[date+time]').reverse()
    if (limit) return query.limit(limit).toArray()
    return query.toArray()
  }, [limit])

  const lastEntry = useLiveQuery(() =>
    db.logEntries.orderBy('[date+time]').reverse().first()
  )

  async function addLogEntry(data: Omit<LogEntry, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString()
    return await db.logEntries.add({ ...data, createdAt: now, updatedAt: now })
  }

  async function updateLogEntry(id: number, data: Partial<LogEntry>) {
    await db.logEntries.update(id, { ...data, updatedAt: new Date().toISOString() })
  }

  async function deleteLogEntry(id: number) {
    await db.logEntries.delete(id)
  }

  async function getEntriesForDateRange(startDate: string, endDate: string): Promise<LogEntry[]> {
    return db.logEntries
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray()
  }

  async function getEntriesByPassage(passageId: number): Promise<LogEntry[]> {
    const entries = await db.logEntries.where('passageId').equals(passageId).toArray()
    return entries.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  }

  return { entries, lastEntry, addLogEntry, updateLogEntry, deleteLogEntry, getEntriesForDateRange, getEntriesByPassage }
}
