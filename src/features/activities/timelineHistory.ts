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
  return entries.sort((a, b) => (a.at < b.at ? 1 : -1))
}

export function filterHistory(entries: TimelineEntry[], filter: TimelineFilter): TimelineEntry[] {
  if (filter === 'all') return entries
  if (filter === 'sentiment') return entries.filter((e) => e.kind === 'sentiment')
  return entries.filter((e) => e.kind === 'activity' && e.activity.type === filter)
}
