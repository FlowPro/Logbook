import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { CrewMember } from '../db/models'

export function useCrew() {
  const crew = useLiveQuery(() => db.crew.orderBy('lastName').toArray())
  const activeCrew = useLiveQuery(() =>
    db.crew.filter(c => c.isActive).toArray()
  )

  async function addCrewMember(data: Omit<CrewMember, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString()
    return await db.crew.add({ ...data, createdAt: now, updatedAt: now })
  }

  async function updateCrewMember(id: number, data: Partial<CrewMember>) {
    await db.crew.update(id, { ...data, updatedAt: new Date().toISOString() })
  }

  async function deleteCrewMember(id: number) {
    await db.crew.delete(id)
  }

  return { crew, activeCrew, addCrewMember, updateCrewMember, deleteCrewMember }
}
