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
  // Compare instants, not strings: Postgres serializes "+00:00" while the
  // client writes "Z", and those don't order correctly as text.
  let latest = contact.createdAt
  let latestMs = Date.parse(latest)
  for (const a of activities) {
    if (a.contactId !== contact.id) continue
    const ms = Date.parse(a.occurredAt)
    if (ms > latestMs) {
      latest = a.occurredAt
      latestMs = ms
    }
  }
  return latest
}

/** Whole CALENDAR days between the last touch and `today` — independent of
 * the time of day, so the 60/90-day attention thresholds don't flip with it. */
export function daysSinceTouch(
  contact: Contact,
  activities: Activity[],
  today: Date = new Date(),
): number {
  const last = new Date(lastTouchDate(contact, activities))
  const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate())
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.max(0, Math.round((todayDay.getTime() - lastDay.getTime()) / 86_400_000))
}

export function computeAttentionLevel(days: number): AttentionLevel {
  if (days >= ATTENTION_AFTER_DAYS) return 'attention'
  if (days >= WATCH_AFTER_DAYS) return 'watch'
  return 'ok'
}
