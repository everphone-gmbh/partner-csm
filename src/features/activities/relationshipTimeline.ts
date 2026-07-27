import type { TrafficLight } from '@/domain/types'
import type { TimelineEntry } from './timelineHistory'

/**
 * Layout-Rechnung für den Historie-Zeitstrahl: verdichtet die Beziehung zu
 * einem waagerechten Verlauf „erster Kontakt → heute". Reine Funktion, damit
 * die Positionsmathematik testbar bleibt und nicht im SVG versteckt liegt.
 *
 * Ergänzt die bestehende (senkrechte) Timeline, ersetzt sie nicht: die
 * Timeline zeigt Einzelheiten, der Zeitstrahl den Bogen — für QBR-Vorbereitung
 * und wenn ein RM einen Kontakt übernimmt.
 */

export type MarkerKind = 'start' | 'activity' | 'sentiment'

export interface TimelineMarker {
  key: string
  at: string
  /** Position 0..1 auf der Achse. */
  x: number
  kind: MarkerKind
  label: string
  /** Nur bei Beziehungsbewertungen gesetzt. */
  sentiment?: TrafficLight
  /** Nur bei Aktivitäten: für Icon-Auswahl in der Komponente. */
  activityType?: string
  /** Kontakt-Aktivität mit Text — Ziel für den Klick in die Timeline. */
  activityId?: string
}

export interface AxisTick {
  x: number
  label: string
}

export interface RelationshipTimeline {
  startAt: string
  endAt: string
  spanDays: number
  markers: TimelineMarker[]
  ticks: AxisTick[]
}

const DAY = 86_400_000

const ACTIVITY_LABEL: Record<string, string> = {
  call: 'Telefonat',
  email: 'E-Mail',
  meeting: 'Treffen',
  note: 'Notiz',
  social: 'Social',
}

const SENTIMENT_LABEL: Record<TrafficLight, string> = {
  green: 'Positiv',
  amber: 'Im Aufbau',
  red: 'Kritisch',
  neutral: 'Neutral',
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
]

/**
 * Achsenmarken passend zur Zeitspanne: Monate für kurze, Quartale für
 * mittlere, Jahre für lange Beziehungen — sonst überlappen die Beschriftungen.
 */
function buildTicks(start: Date, end: Date, span: number): AxisTick[] {
  const total = end.getTime() - start.getTime()
  if (total <= 0) return []
  const at = (d: Date, label: string): AxisTick => ({
    x: (d.getTime() - start.getTime()) / total,
    label,
  })
  const ticks: AxisTick[] = []

  if (span <= 400) {
    // Monatsanfänge
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    if (cursor < start) cursor.setMonth(cursor.getMonth() + 1)
    while (cursor <= end) {
      ticks.push(at(new Date(cursor), MONTHS_SHORT[cursor.getMonth()]))
      cursor.setMonth(cursor.getMonth() + 1)
    }
  } else if (span <= 1500) {
    // Quartalsanfänge
    const cursor = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1)
    if (cursor < start) cursor.setMonth(cursor.getMonth() + 3)
    while (cursor <= end) {
      const q = Math.floor(cursor.getMonth() / 3) + 1
      ticks.push(at(new Date(cursor), `Q${q}/${String(cursor.getFullYear()).slice(2)}`))
      cursor.setMonth(cursor.getMonth() + 3)
    }
  } else {
    // Jahresanfänge
    const cursor = new Date(start.getFullYear() + 1, 0, 1)
    while (cursor <= end) {
      ticks.push(at(new Date(cursor), String(cursor.getFullYear())))
      cursor.setFullYear(cursor.getFullYear() + 1)
    }
  }
  return ticks
}

/**
 * Baut den Zeitstrahl aus der gemergten Historie.
 *
 * `createdAt` ist der Beginn der Partnerschaft. Liegt eine Aktivität davor
 * (nachträglich erfasst), verschiebt sich der Anfang entsprechend; liegt ein
 * Eintrag in der Zukunft (geplantes Treffen), wandert das Ende dorthin.
 */
export function buildRelationshipTimeline(
  entries: TimelineEntry[],
  createdAt: string,
  today: Date = new Date(),
): RelationshipTimeline {
  const stamps = entries.map((e) => Date.parse(e.at)).filter((t) => Number.isFinite(t))
  const createdMs = Date.parse(createdAt)
  const startMs = Math.min(...[Number.isFinite(createdMs) ? createdMs : today.getTime(), ...stamps])
  const endMs = Math.max(...[today.getTime(), ...stamps])

  const start = new Date(startMs)
  const end = new Date(endMs)
  const total = endMs - startMs
  const spanDays = Math.max(0, Math.round(total / DAY))
  // Alles am selben Tag: einzelne Marke mittig statt Division durch Null.
  const pos = (ms: number) => (total > 0 ? (ms - startMs) / total : 0.5)

  const markers: TimelineMarker[] = []
  if (Number.isFinite(createdMs)) {
    markers.push({
      key: 'start',
      at: new Date(createdMs).toISOString(),
      x: pos(createdMs),
      kind: 'start',
      label: 'Partnerschaft beginnt',
    })
  }
  for (const entry of entries) {
    const ms = Date.parse(entry.at)
    if (!Number.isFinite(ms)) continue
    if (entry.kind === 'activity') {
      markers.push({
        key: `a-${entry.activity.id}`,
        at: entry.at,
        x: pos(ms),
        kind: 'activity',
        label: ACTIVITY_LABEL[entry.activity.type] ?? entry.activity.type,
        activityType: entry.activity.type,
        activityId: entry.activity.id,
      })
    } else {
      markers.push({
        key: `s-${entry.at}-${entry.entry.value}`,
        at: entry.at,
        x: pos(ms),
        kind: 'sentiment',
        label: `Bewertung: ${SENTIMENT_LABEL[entry.entry.value]}`,
        sentiment: entry.entry.value,
      })
    }
  }
  markers.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    spanDays,
    markers,
    ticks: buildTicks(start, end, spanDays),
  }
}
