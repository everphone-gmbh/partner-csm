import type { EventAttendee, EventItem, Reminder } from '@/domain/types'
import type { NewReminder } from '@/data/repository'

const FOLLOW_UP_AFTER_DAYS = 3

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * One-click post-event follow-ups: a reminder per ATTENDED contact, due in
 * 3 days, carrying the "Wofür" purpose when one was set. Contacts that
 * already have an open reminder starting with this event's follow-up text
 * are skipped, so the button is safely re-clickable.
 */
export function buildFollowUpReminders(
  event: EventItem,
  attendees: EventAttendee[],
  existingReminders: Reminder[],
  createdByName: string,
  today: Date = new Date(),
): NewReminder[] {
  const base = `Follow-up ${event.name}`
  const due = new Date(today.getFullYear(), today.getMonth(), today.getDate() + FOLLOW_UP_AFTER_DAYS)

  const alreadyOpen = new Set(
    existingReminders
      .filter((r) => !r.done && r.text.startsWith(base))
      .map((r) => r.contactId),
  )

  return attendees
    .filter((a) => a.status === 'attended' && !alreadyOpen.has(a.contactId))
    .map((a) => ({
      contactId: a.contactId,
      dueDate: ymd(due),
      text: a.purpose ? `${base}: ${a.purpose}` : base,
      createdByName,
    }))
}
