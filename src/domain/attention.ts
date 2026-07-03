import type { Activity, Contact } from './types'

export type AttentionLevel = 'ok' | 'watch' | 'attention'

export const ATTENTION_LABEL: Record<AttentionLevel, string> = {
  ok: 'Aktiv',
  watch: 'Bald nachfassen',
  attention: 'Braucht Aufmerksamkeit',
}

/** Global default thresholds in days since the last logged touch. */
const WATCH_AFTER_DAYS = 60
const ATTENTION_AFTER_DAYS = 90

/** How far past an individual cadence target counts as "attention". */
const CADENCE_ATTENTION_FACTOR = 1.5

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

/**
 * Staleness level, measured against the contact's individual cadence target
 * when one is set (watch at the target, attention at 1.5x), otherwise
 * against the global 60/90-day defaults.
 */
export function computeAttentionLevel(days: number, cadenceDays?: number): AttentionLevel {
  const watchAfter = cadenceDays ?? WATCH_AFTER_DAYS
  const attentionAfter = cadenceDays
    ? Math.round(cadenceDays * CADENCE_ATTENTION_FACTOR)
    : ATTENTION_AFTER_DAYS
  if (days >= attentionAfter) return 'attention'
  if (days >= watchAfter) return 'watch'
  return 'ok'
}
