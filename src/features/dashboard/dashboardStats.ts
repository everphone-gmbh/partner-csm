import type { Contact, TrafficLight } from '@/domain/types'
import { daysUntilBirthday } from '@/lib/format'

export interface UpcomingAnniversary {
  contact: Contact
  /** Completed partnership years at the upcoming anniversary. */
  years: number
  inDays: number
}

/**
 * Partnership anniversaries: contacts whose createdAt date has its yearly
 * anniversary within `withinDays` and who have been in the book >= 1 year.
 * Reuses the leap-aware next-occurrence logic from daysUntilBirthday.
 */
export function upcomingAnniversaries(
  contacts: Contact[],
  withinDays: number,
  today: Date,
): UpcomingAnniversary[] {
  const out: UpcomingAnniversary[] = []
  for (const c of contacts) {
    const created = new Date(c.createdAt)
    if (Number.isNaN(created.getTime())) continue
    const createdYmd = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`
    const inDays = daysUntilBirthday(createdYmd, today)
    if (inDays === null || inDays > withinDays) continue
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const anniversary = new Date(startOfToday.getTime() + inDays * 86_400_000)
    const years = anniversary.getFullYear() - created.getFullYear()
    if (years < 1) continue
    out.push({ contact: c, years, inDays })
  }
  return out.sort((a, b) => a.inDays - b.inDays)
}

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

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/**
 * Contacts grouped by day-of-month for one displayed calendar month
 * (0-based month index, matching Date). Parses the YYYY-MM-DD birthday
 * string directly — no Date construction, no timezone drift. Feb-29
 * birthdays land on Feb 28 in non-leap years (same convention as
 * daysUntilBirthday).
 */
export function birthdaysInMonth(
  contacts: Contact[],
  year: number,
  monthIndex: number,
): Map<number, Contact[]> {
  const map = new Map<number, Contact[]>()
  for (const c of contacts) {
    const m = c.birthday?.match(/^\d{4}-(\d{2})-(\d{2})$/)
    if (!m) continue
    const bMonth = Number(m[1]) - 1
    let bDay = Number(m[2])
    if (bMonth !== monthIndex) continue
    if (bMonth === 1 && bDay === 29 && !isLeapYear(year)) bDay = 28
    const list = map.get(bDay) ?? []
    list.push(c)
    map.set(bDay, list)
  }
  return map
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
