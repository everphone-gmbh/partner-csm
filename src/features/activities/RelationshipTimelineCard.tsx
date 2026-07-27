import { useMemo } from 'react'
import { Flag, GitCommitVertical } from 'lucide-react'
import type { ActivityType, TrafficLight } from '@/domain/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ACTIVITY_META } from './activityMeta'
import type { TimelineEntry } from './timelineHistory'
import { buildRelationshipTimeline, type TimelineMarker } from './relationshipTimeline'

const SENTIMENT_COLOR: Record<TrafficLight, string> = {
  green: 'var(--status-green)',
  amber: 'var(--status-amber)',
  red: 'var(--status-red)',
  neutral: 'var(--status-neutral)',
}

/** Marken am selben Tag zusammenfassen, damit Punkte nicht übereinander liegen. */
interface MarkerGroup {
  x: number
  day: string
  markers: TimelineMarker[]
}

function groupByDay(markers: TimelineMarker[]): MarkerGroup[] {
  const groups = new Map<string, MarkerGroup>()
  for (const marker of markers) {
    const day = marker.at.slice(0, 10)
    const existing = groups.get(day)
    if (existing) {
      existing.markers.push(marker)
      // Gruppe an der spätesten Marke des Tages ausrichten (stabil genug).
      existing.x = Math.max(existing.x, marker.x)
    } else {
      groups.set(day, { x: marker.x, day, markers: [marker] })
    }
  }
  return [...groups.values()].sort((a, b) => a.x - b.x)
}

function groupIcon(group: MarkerGroup) {
  const lead =
    group.markers.find((m) => m.kind === 'sentiment') ??
    group.markers.find((m) => m.kind === 'activity') ??
    group.markers[0]
  if (lead.kind === 'start') return { Icon: Flag, color: 'var(--primary)' }
  if (lead.kind === 'sentiment') {
    return { Icon: GitCommitVertical, color: SENTIMENT_COLOR[lead.sentiment ?? 'neutral'] }
  }
  const meta = ACTIVITY_META[(lead.activityType ?? 'note') as ActivityType]
  return { Icon: meta.icon, color: 'var(--muted-foreground)' }
}

/**
 * Historie-Zeitstrahl: der Beziehungsverlauf als waagerechte Achse von der
 * ersten Berührung bis heute. Ergänzt die senkrechte Timeline (Einzelheiten)
 * um den Überblick — gedacht für QBR-Vorbereitung und Kontakt-Übernahmen.
 *
 * Reine Darstellung bereits geladener Daten, kein zusätzlicher Abruf.
 */
export function RelationshipTimelineCard({
  history,
  createdAt,
}: {
  /** Bereits gemergte Historie (Aktivitäten + Bewertungen) aus buildHistory. */
  history: TimelineEntry[]
  createdAt: string
}) {
  const timeline = useMemo(
    () => buildRelationshipTimeline(history, createdAt),
    [history, createdAt],
  )
  const groups = useMemo(() => groupByDay(timeline.markers), [timeline.markers])

  // Ohne Verlauf (nur die Startmarke) sagt der Zeitstrahl nichts aus.
  const hasHistory = timeline.markers.some((m) => m.kind !== 'start')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Historie</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasHistory ? (
          <p className="text-sm text-muted-foreground">
            Noch kein Verlauf — sobald Kontakte protokolliert oder die Beziehung bewertet wird,
            entsteht hier der Zeitstrahl.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span>{formatDate(timeline.startAt)}</span>
              <span>
                {timeline.spanDays >= 365
                  ? `${(timeline.spanDays / 365).toFixed(1).replace('.', ',')} Jahre Beziehung`
                  : `${timeline.spanDays} Tage Beziehung`}
              </span>
              <span>{formatDate(timeline.endAt)}</span>
            </div>

            {/* Achse mit Marken. Prozentpositionen statt SVG, damit Text
                sauber umbricht und die Karte responsiv bleibt. */}
            <div className="relative h-16">
              <div className="absolute inset-x-0 top-6 h-px bg-border" />
              {timeline.ticks.map((tick) => (
                <div
                  key={`${tick.label}-${tick.x}`}
                  className="absolute top-6 flex -translate-x-1/2 flex-col items-center"
                  style={{ left: `${tick.x * 100}%` }}
                >
                  <span className="h-1.5 w-px bg-border" />
                  <span className="mt-0.5 whitespace-nowrap text-[10px] text-muted-foreground">
                    {tick.label}
                  </span>
                </div>
              ))}
              {groups.map((group) => {
                const { Icon, color } = groupIcon(group)
                const summary = group.markers.map((m) => m.label).join(' · ')
                return (
                  <div
                    key={group.day}
                    className="absolute top-6 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${group.x * 100}%` }}
                    title={`${formatDate(group.day)} — ${summary}`}
                  >
                    <span
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full border-2 border-card bg-card',
                      )}
                      style={{ boxShadow: `0 0 0 1.5px ${color}` }}
                    >
                      <Icon className="size-3" />
                      {group.markers.length > 1 && (
                        <span className="absolute -right-1 -top-1 flex size-3 items-center justify-center rounded-full bg-primary text-[8px] font-semibold text-primary-foreground">
                          {group.markers.length}
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Flag className="size-3" style={{ color: 'var(--primary)' }} /> Start
              </span>
              <span className="inline-flex items-center gap-1.5">
                <GitCommitVertical className="size-3" /> Bewertung
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ACTIVITY_META.meeting.icon className="size-3" /> Kontakt
              </span>
              <span>Punkt antippen für Datum und Inhalt</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
