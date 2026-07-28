import type { EventAttendee, EventItem } from '@/domain/types'

/**
 * Terminlogik für den Event-Hub: Mehrtages-Events und Standtermine pro Kontakt.
 *
 * Reine Funktionen — die Zeitrechnung (Überschneidungen, Tagesraster) ist der
 * fehleranfällige Teil und gehört nicht in eine Komponente.
 */

/** Standarddauer, wenn ein Termin ohne Dauer gepflegt wurde. */
export const DEFAULT_SLOT_MINUTES = 30

const MINUTE = 60_000

/** Kalendertage, die das Event umfasst (als YYYY-MM-DD, Start inklusive). */
export function eventDays(event: Pick<EventItem, 'date' | 'endDate'>): string[] {
  const start = event.date
  const end = event.endDate && event.endDate > start ? event.endDate : start
  const days: string[] = []
  // Über die Datumsteile iterieren, nicht über Zeitstempel: so verschiebt
  // keine Zeitzone den Tag.
  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  // Obergrenze gegen Endlosschleifen bei absurden Daten.
  for (let i = 0; cursor <= last && i < 400; i++) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

export function isMultiDay(event: Pick<EventItem, 'date' | 'endDate'>): boolean {
  return eventDays(event).length > 1
}

export interface SlotWindow {
  startMs: number
  endMs: number
}

/** Zeitfenster eines Termins; undefined, wenn kein Termin gesetzt ist. */
export function slotWindow(attendee: Pick<EventAttendee, 'slotAt' | 'slotMinutes'>): SlotWindow | undefined {
  if (!attendee.slotAt) return undefined
  const startMs = Date.parse(attendee.slotAt)
  if (!Number.isFinite(startMs)) return undefined
  const minutes = attendee.slotMinutes && attendee.slotMinutes > 0
    ? attendee.slotMinutes
    : DEFAULT_SLOT_MINUTES
  return { startMs, endMs: startMs + minutes * MINUTE }
}

/**
 * Liegt der Termin innerhalb der Event-Tage? Verhindert Termine, die
 * versehentlich neben dem Event landen (Tippfehler im Datum).
 */
export function isSlotWithinEvent(
  slotAt: string,
  event: Pick<EventItem, 'date' | 'endDate'>,
): boolean {
  const ms = Date.parse(slotAt)
  if (!Number.isFinite(ms)) return false
  // Lokaler Kalendertag des Termins — der Nutzer denkt in Ortszeit.
  const d = new Date(ms)
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
  return eventDays(event).includes(day)
}

/**
 * Paare von Teilnehmern mit sich überschneidenden Terminen. Zwei Termine
 * kollidieren, wenn sich ihre Fenster echt überlappen — direkt aneinander
 * anschließende Termine (10:00–10:30 und 10:30–11:00) sind in Ordnung.
 */
export function findSlotConflicts(
  attendees: Pick<EventAttendee, 'contactId' | 'slotAt' | 'slotMinutes'>[],
): [string, string][] {
  const withWindow = attendees
    .map((a) => ({ contactId: a.contactId, win: slotWindow(a) }))
    .filter((a): a is { contactId: string; win: SlotWindow } => Boolean(a.win))
    .sort((a, b) => a.win.startMs - b.win.startMs)

  const conflicts: [string, string][] = []
  for (let i = 0; i < withWindow.length; i++) {
    for (let j = i + 1; j < withWindow.length; j++) {
      const a = withWindow[i]
      const b = withWindow[j]
      // Sortiert: sobald b nach a's Ende beginnt, können auch alle
      // folgenden nicht mehr überlappen.
      if (b.win.startMs >= a.win.endMs) break
      conflicts.push([a.contactId, b.contactId])
    }
  }
  return conflicts
}

/** contactIds, die an mindestens einer Überschneidung beteiligt sind. */
export function conflictingContactIds(
  attendees: Pick<EventAttendee, 'contactId' | 'slotAt' | 'slotMinutes'>[],
): Set<string> {
  const ids = new Set<string>()
  for (const [a, b] of findSlotConflicts(attendees)) {
    ids.add(a)
    ids.add(b)
  }
  return ids
}

/**
 * Vergleichsfunktion für die Agenda: Termine zuerst (chronologisch), danach
 * Teilnehmer ohne Termin. So steht vor Ort oben, was als Nächstes ansteht.
 */
export function bySlotFirst(
  a: Pick<EventAttendee, 'slotAt' | 'slotMinutes'>,
  b: Pick<EventAttendee, 'slotAt' | 'slotMinutes'>,
): number {
  const wa = slotWindow(a)
  const wb = slotWindow(b)
  if (wa && wb) return wa.startMs - wb.startMs
  if (wa) return -1
  if (wb) return 1
  return 0
}

/** „14:30" — Uhrzeit eines Termins in Ortszeit, ohne Datum. */
export function slotTimeLabel(slotAt: string): string {
  const ms = Date.parse(slotAt)
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Trennt einen Zeitpunkt in die Werte für `<input type=date|time>` (Ortszeit). */
export function slotToInputs(slotAt?: string): { day: string; time: string } {
  if (!slotAt) return { day: '', time: '' }
  const ms = Date.parse(slotAt)
  if (!Number.isFinite(ms)) return { day: '', time: '' }
  const d = new Date(ms)
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
  return { day, time: slotTimeLabel(slotAt) }
}

/**
 * Baut aus Datums- und Zeitfeld einen Zeitpunkt (Ortszeit → ISO).
 * Gibt undefined zurück, wenn eins von beiden fehlt oder unplausibel ist.
 */
export function inputsToSlot(day: string, time: string): string | undefined {
  if (!day || !time) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  const t = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!m || !t) return undefined
  const [hh, mm] = [Number(t[1]), Number(t[2])]
  if (hh > 23 || mm > 59) return undefined
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm, 0, 0)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
