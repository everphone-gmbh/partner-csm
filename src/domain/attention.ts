import type { Activity, Contact } from './types'

export type AttentionLevel = 'ok' | 'watch' | 'attention'

export const ATTENTION_LABEL: Record<AttentionLevel, string> = {
  ok: 'Aktiv',
  watch: 'Bald nachfassen',
  attention: 'Braucht Aufmerksamkeit',
}

/** Thresholds in days since the last logged touch. */
const WATCH_AFTER_DAYS = 60
const ATTENTION_AFTER_DAYS = 90

/**
 * The most recent point of contact for this person: the latest logged
 * activity, or the contact's creation date if nothing has been logged yet
 * (so a brand-new contact isn't immediately flagged as stale).
 */
export function lastTouchDate(contact: Contact, activities: Activity[]): string {
  let latest = contact.createdAt
  for (const a of activities) {
    if (a.contactId === contact.id && a.occurredAt > latest) latest = a.occurredAt
  }
  return latest
}

/** Whole days between the last touch and `today`. */
export function daysSinceTouch(
  contact: Contact,
  activities: Activity[],
  today: Date = new Date(),
): number {
  const last = new Date(lastTouchDate(contact, activities))
  const diffMs = today.getTime() - last.getTime()
  return Math.max(0, Math.floor(diffMs / 86_400_000))
}

export function computeAttentionLevel(days: number): AttentionLevel {
  if (days >= ATTENTION_AFTER_DAYS) return 'attention'
  if (days >= WATCH_AFTER_DAYS) return 'watch'
  return 'ok'
}
