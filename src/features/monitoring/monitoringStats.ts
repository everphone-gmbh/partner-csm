import type { Activity, Contact, TrafficLight } from '@/domain/types'

/** Sentiment split across the whole (visible) portfolio — donut chart data. */
export function portfolioSentiment(contacts: Contact[]): Record<TrafficLight, number> {
  const split: Record<TrafficLight, number> = { green: 0, amber: 0, red: 0, neutral: 0 }
  for (const c of contacts) split[c.sentiment]++
  return split
}

export interface WeekBucket {
  /** Monday of the week, local time. */
  weekStart: Date
  count: number
}

/** Monday of the week containing `d`, local midnight. */
function mondayOf(d: Date): Date {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const shift = (day.getDay() + 6) % 7 // Mon=0 … Sun=6
  day.setDate(day.getDate() - shift)
  return day
}

/**
 * Activity counts bucketed into ISO(-ish) Monday weeks: `weeks` buckets,
 * oldest first, the current week last. Activities outside the window are
 * dropped. Instant-parsed, bucketed by local calendar week.
 */
export function activitiesPerWeek(
  activities: Activity[],
  weeks: number,
  today: Date = new Date(),
): WeekBucket[] {
  const currentMonday = mondayOf(today)
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: new Date(
      currentMonday.getFullYear(),
      currentMonday.getMonth(),
      currentMonday.getDate() - 7 * (weeks - 1 - i),
    ),
    count: 0,
  }))
  const firstMs = buckets[0].weekStart.getTime()
  for (const a of activities) {
    const t = Date.parse(a.occurredAt)
    if (Number.isNaN(t) || t < firstMs) continue
    const monday = mondayOf(new Date(t)).getTime()
    const idx = buckets.findIndex((b) => b.weekStart.getTime() === monday)
    if (idx >= 0) buckets[idx].count++
  }
  return buckets
}
