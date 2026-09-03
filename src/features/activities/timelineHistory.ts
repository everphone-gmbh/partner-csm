import type { Activity, ActivityType, SentimentEntry } from '@/domain/types'

export type TimelineEntry =
  | { kind: 'activity'; at: string; activity: Activity }
  | { kind: 'sentiment'; at: string; entry: SentimentEntry }

export type TimelineFilter = 'all' | ActivityType | 'sentiment'

/**
 * Merges logged activities and sentiment-history (relationship rating)
 * changes into one reverse-chronological history — the "unified timeline".
 * Reminders are intentionally excluded: they're forward-looking (a due date,
 * not a past event) and are rendered as a separate "Upcoming" section.
 */
export function buildHistory(
  activities: Activity[],
  sentimentHistory: SentimentEntry[] = [],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...activities.map((activity) => ({ kind: 'activity' as const, at: activity.occurredAt, activity })),
    ...sentimentHistory.map((entry) => ({ kind: 'sentiment' as const, at: entry.at, entry })),
  ]
  // Compare instants (Postgres may serialize +00:00, the client writes Z);
  // equal timestamps return 0 so the stable sort keeps insertion order.
  return entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

export function filterHistory(entries: TimelineEntry[], filter: TimelineFilter): TimelineEntry[] {
  if (filter === 'all') return entries
  if (filter === 'sentiment') return entries.filter((e) => e.kind === 'sentiment')
  return entries.filter((e) => e.kind === 'activity' && e.activity.type === filter)
}

/** A run of history entries under one date-bucket header. */
export interface TimelineGroup {
  /** Stable React key ('today' | 'yesterday' | 'week' | 'YYYY-MM' | 'unknown'). */
  key: string
  /** Human header, e.g. "Heute" or "August 2026". */
  label: string
  entries: TimelineEntry[]
}

function bucketFor(at: string, start: Date): { key: string; label: string } {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return { key: 'unknown', label: 'Ohne Datum' }
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((start.getTime() - that.getTime()) / 86_400_000)
  if (diffDays <= 0) return { key: 'today', label: 'Heute' } // today (future is defensive)
  if (diffDays === 1) return { key: 'yesterday', label: 'Gestern' }
  if (diffDays < 7) return { key: 'week', label: 'Diese Woche' }
  return {
    key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    label: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
  }
}

/**
 * Buckets the (already newest-first) history into date groups for the timeline
 * rail: "Heute", "Gestern", "Diese Woche" (2–6 days back), then one group per
 * calendar month ("August 2026"). Order is preserved — groups come out
 * newest-first and each group keeps its entries newest-first. Grouping is
 * contiguous, which is safe because the input is sorted by instant: entries
 * sharing a bucket are always adjacent, so equal-but-non-adjacent groups can't
 * occur.
 */
export function groupHistory(entries: TimelineEntry[], now: Date = new Date()): TimelineGroup[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const groups: TimelineGroup[] = []
  for (const entry of entries) {
    const bucket = bucketFor(entry.at, start)
    const last = groups[groups.length - 1]
    if (last && last.key === bucket.key) last.entries.push(entry)
    else groups.push({ key: bucket.key, label: bucket.label, entries: [entry] })
  }
  return groups
}
