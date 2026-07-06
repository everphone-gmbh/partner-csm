import { describe, it, expect } from 'vitest'
import { buildFollowUpReminders } from './followUps'
import type { EventAttendee, EventItem, Reminder } from '@/domain/types'

const event: EventItem = { id: 'ev-1', name: 'Digital X 2026', date: '2026-10-15' }

const attendees: EventAttendee[] = [
  { contactId: 'c-met', status: 'attended' },
  { contactId: 'c-met-2', status: 'attended', purpose: 'Cloud-Ausbau besprechen' },
  { contactId: 'c-noshow', status: 'no_show' },
  { contactId: 'c-accepted', status: 'accepted' },
]

const today = new Date(2026, 9, 16, 12, 0) // 2026-10-16 local

describe('buildFollowUpReminders', () => {
  it('creates a follow-up per attended contact, due in 3 days', () => {
    const out = buildFollowUpReminders(event, attendees, [], 'Alexandra', today)
    expect(out.map((r) => r.contactId).sort()).toEqual(['c-met', 'c-met-2'])
    expect(out[0].dueDate).toBe('2026-10-19')
    expect(out[0].text).toBe('Follow-up Digital X 2026')
    expect(out[0].createdByName).toBe('Alexandra')
  })

  it('carries the "Wofür" purpose into the reminder text when present', () => {
    const out = buildFollowUpReminders(event, attendees, [], 'A', today)
    const withPurpose = out.find((r) => r.contactId === 'c-met-2')
    expect(withPurpose?.text).toBe('Follow-up Digital X 2026: Cloud-Ausbau besprechen')
  })

  it('skips contacts that already have an open reminder for this event', () => {
    const existing: Reminder[] = [
      {
        id: 'r1',
        contactId: 'c-met',
        dueDate: '2026-10-20',
        text: 'Follow-up Digital X 2026',
        done: false,
        createdByName: 'A',
      },
    ]
    const out = buildFollowUpReminders(event, attendees, existing, 'A', today)
    expect(out.map((r) => r.contactId)).toEqual(['c-met-2'])
  })

  it('does NOT skip when the matching reminder is already done', () => {
    const existing: Reminder[] = [
      {
        id: 'r1',
        contactId: 'c-met',
        dueDate: '2026-10-01',
        text: 'Follow-up Digital X 2026',
        done: true,
        createdByName: 'A',
      },
    ]
    const out = buildFollowUpReminders(event, attendees, existing, 'A', today)
    expect(out.map((r) => r.contactId).sort()).toEqual(['c-met', 'c-met-2'])
  })
})
