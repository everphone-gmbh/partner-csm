import type { Contact, TrafficLight } from '@/domain/types'
import { daysUntilBirthday } from '@/lib/format'

export interface RegionCoverage {
  regionId: string
  total: number
  bySentiment: Record<TrafficLight, number>
  /** Contacts with a rated relationship (sentiment !== neutral). */
  rated: number
  /** rated / total as a 0-100 percentage. */
  coveragePct: number
}

/** Per-region relationship coverage — the management steering view. */
export function computeRegionCoverage(contacts: Contact[]): RegionCoverage[] {
  const map = new Map<string, RegionCoverage>()
  for (const c of contacts) {
    let r = map.get(c.regionId)
    if (!r) {
      r = {
        regionId: c.regionId,
        total: 0,
        bySentiment: { green: 0, amber: 0, red: 0, neutral: 0 },
        rated: 0,
        coveragePct: 0,
      }
      map.set(c.regionId, r)
    }
    r.total++
    r.bySentiment[c.sentiment]++
    if (c.sentiment !== 'neutral') r.rated++
  }
  for (const r of map.values()) {
    r.coveragePct = r.total ? Math.round((r.rated / r.total) * 100) : 0
  }
  return [...map.values()].sort((a, b) => a.regionId.localeCompare(b.regionId))
}

export interface UpcomingBirthday {
  contact: Contact
  inDays: number
}

/** Contacts whose next birthday is within `withinDays`, soonest first. */
export function upcomingBirthdays(
  contacts: Contact[],
  withinDays: number,
  today: Date,
): UpcomingBirthday[] {
  const out: UpcomingBirthday[] = []
  for (const c of contacts) {
    const inDays = daysUntilBirthday(c.birthday, today)
    if (inDays !== null && inDays <= withinDays) out.push({ contact: c, inDays })
  }
  return out.sort((a, b) => a.inDays - b.inDays)
}

export interface OverallSummary {
  total: number
  engaged: number
  engagedPct: number
}

/** Headline numbers across all (scoped) contacts. */
export function overallSummary(contacts: Contact[]): OverallSummary {
  const total = contacts.length
  const engaged = contacts.filter((c) => c.sentiment !== 'neutral').length
  return { total, engaged, engagedPct: total ? Math.round((engaged / total) * 100) : 0 }
}
