import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { Ship } from '../db/models'

export function useShip() {
  const ship = useLiveQuery(() => db.ship.toCollection().first())

  async function saveShip(data: Omit<Ship, 'id' | 'createdAt' | 'updatedAt'>) {
    const existing = await db.ship.toCollection().first()
    const now = new Date().toISOString()

    if (existing?.id) {
      await db.ship.update(existing.id, { ...data, updatedAt: now })
    } else {
      await db.ship.add({ ...data, createdAt: now, updatedAt: now })
    }
  }

  return { ship, saveShip }
}
