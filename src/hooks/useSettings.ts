import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { AppSettings } from '../db/models'
import { useTranslation } from 'react-i18next'

export function useSettings() {
  const { i18n } = useTranslation()

  const settings = useLiveQuery(() => db.settings.toCollection().first())

  async function updateSettings(updates: Partial<AppSettings>) {
    const current = await db.settings.toCollection().first()
    if (!current?.id) return

    const updated = { ...current, ...updates, updatedAt: new Date().toISOString() }
    await db.settings.update(current.id, updated)

    if (updates.language) {
      await i18n.changeLanguage(updates.language)
    }

    if (updates.darkMode !== undefined) {
      if (updates.darkMode) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
  }

  return { settings, updateSettings }
}
