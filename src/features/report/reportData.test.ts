import { describe, it, expect } from 'vitest'
import { buildRegionReport } from './reportData'
import type { Activity, Contact } from '@/domain/types'

function contact(
  partial: Partial<Contact> & Pick<Contact, 'id' | 'regionId' | 'sentiment'>,
): Contact {
  return {
    fullName: `Kontakt ${partial.id}`,
    position: 'P',
    relationshipManagerId: 'u',
    linkedin: { status: 'unknown' },
    wonCustomersCount: 0,
    sideFacts: [],
    customers: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

function activity(contactId: string, occurredAt: string): Activity {
  return {
    id: `a-${contactId}-${occurredAt}`,
    contactId,
    type: 'note',
    occurredAt,
    authorId: 'u',
    authorName: 'U',
    body: '',
    attachments: [],
  }
}

const today = new Date(2026, 6, 1, 12, 0) // 2026-07-01 local

const contacts = [
  contact({ id: 'a', regionId: 'r-nord', sentiment: 'green', birthday: '1980-07-10' }),
  contact({ id: 'b', regionId: 'r-nord', sentiment: 'neutral' }), // stale: created 2026-01-01, no activity
  contact({ id: 'c', regionId: 'r-sued', sentiment: 'red' }),
]
const activities = [
  activity('a', new Date(2026, 5, 20).toISOString()), // recent touch for a
  activity('c', new Date(2026, 5, 25).toISOString()),
]

describe('buildRegionReport', () => {
  it('aggregates only the selected region', () => {
    const r = buildRegionReport(contacts, activities, 'r-nord', null, today)
    expect(r.total).toBe(2)
    expect(r.engaged).toBe(1)
    expect(r.engagedPct).toBe(50)
    expect(r.bySentiment.green).toBe(1)
    expect(r.bySentiment.red).toBe(0)
  })

  it('lists stale contacts (respecting cadence) sorted by staleness', () => {
    const r = buildRegionReport(contacts, activities, 'r-nord', null, today)
    expect(r.stale.map((s) => s.contact.id)).toEqual(['b'])
    expect(r.stale[0].days).toBeGreaterThan(90)
  })

  it('includes upcoming birthdays within 30 days', () => {
    const r = buildRegionReport(contacts, activities, 'r-nord', null, today)
    expect(r.birthdays.map((b) => b.contact.id)).toEqual(['a'])
  })

  it('counts activities of the last 30 days for the region', () => {
    const r = buildRegionReport(contacts, activities, 'r-nord', null, today)
    expect(r.recentActivities).toBe(1) // only contact a's touch is in Nord
  })

  it('covers all regions when regionId is null', () => {
    const r = buildRegionReport(contacts, activities, null, null, today)
    expect(r.total).toBe(3)
    expect(r.recentActivities).toBe(2)
  })

  it('narrows to one relationship manager when managerId is set', () => {
    const withRm = [
      contact({ id: 'a', regionId: 'r-nord', sentiment: 'green', relationshipManagerId: 'u-alex' }),
      contact({ id: 'b', regionId: 'r-nord', sentiment: 'neutral', relationshipManagerId: 'u-olaf' }),
      contact({ id: 'c', regionId: 'r-sued', sentiment: 'red', relationshipManagerId: 'u-alex' }),
    ]
    const all = buildRegionReport(withRm, [], null, 'u-alex', today)
    expect(all.total).toBe(2)
    expect(all.bySentiment.green).toBe(1)
    expect(all.bySentiment.red).toBe(1)

    const combined = buildRegionReport(withRm, [], 'r-nord', 'u-alex', today)
    expect(combined.total).toBe(1)
    expect(combined.bySentiment.green).toBe(1)
  })
})
