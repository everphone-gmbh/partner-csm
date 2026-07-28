import { useMemo } from 'react'
import { repository } from '@/data/repositoryProvider'
import { useRepoQuery } from './useRepoQuery'

/** Heutiges Datum als YYYY-MM-DD in Ortszeit (nicht UTC). */
function todayKey(today: Date): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`
}

/**
 * Anzahl offener, fälliger Reminder (heute oder überfällig) — für den Zähler
 * in der Navigation, damit Fälliges auffällt, ohne auf die Übersicht zu gehen.
 *
 * Keine Regions-Filterung nötig: RLS (Migration 0004) liefert nur Reminder zu
 * Kontakten, die der angemeldete Nutzer sehen darf.
 */
export function useDueReminderCount(today: Date = new Date()): number {
  const { data } = useRepoQuery(() => repository.listReminders(), [])
  const key = todayKey(today)
  return useMemo(
    () => (data ?? []).filter((r) => !r.done && r.dueDate <= key).length,
    [data, key],
  )
}
