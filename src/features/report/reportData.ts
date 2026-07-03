import type { Activity, Contact, TrafficLight } from '@/domain/types'
import { computeAttentionLevel, daysSinceTouch } from '@/domain/attention'
import { upcomingBirthdays, type UpcomingBirthday } from '@/features/dashboard/dashboardStats'

export interface RegionReport {
  total: number
  engaged: number
  engagedPct: number
  bySentiment: Record<TrafficLight, number>
  /** Contacts needing attention (cadence-aware), most neglected first. */
  stale: { contact: Contact; days: number }[]
  birthdays: UpcomingBirthday[]
  /** Logged touches in the last 30 days within the scope. */
  recentActivities: number
}

/**
 * Assembles the QBR one-pager data for one region (or all, regionId = null).
 * Pure composition of the tested domain helpers — same numbers as the
 * dashboard and monitoring screens.
 */
export function buildRegionReport(
  contacts: Contact[],
  activities: Activity[],
  regionId: string | null,
  today: Date = new Date(),
): RegionReport {
  const scoped = regionId ? contacts.filter((c) => c.regionId === regionId) : contacts
  const scopedIds = new Set(scoped.map((c) => c.id))

  const bySentiment: Record<TrafficLight, number> = { green: 0, amber: 0, red: 0, neutral: 0 }
  for (const c of scoped) bySentiment[c.sentiment]++
  const engaged = scoped.length - bySentiment.neutral

  const stale = scoped
    .map((contact) => ({ contact, days: daysSinceTouch(contact, activities, today) }))
    .filter(({ contact, days }) => computeAttentionLevel(days, contact.cadenceDays) !== 'ok')
    .sort((a, b) => b.days - a.days)

  const cutoff = today.getTime() - 30 * 86_400_000
  const recentActivities = activities.filter(
    (a) => scopedIds.has(a.contactId) && Date.parse(a.occurredAt) >= cutoff,
  ).length

  return {
    total: scoped.length,
    engaged,
    engagedPct: scoped.length ? Math.round((engaged / scoped.length) * 100) : 0,
    bySentiment,
    stale,
    birthdays: upcomingBirthdays(scoped, 30, today),
    recentActivities,
  }
}
