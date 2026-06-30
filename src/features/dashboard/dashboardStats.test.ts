import { describe, it, expect } from 'vitest'
import { computeRegionCoverage, overallSummary, upcomingBirthdays } from './dashboardStats'
import type { Contact } from '@/domain/types'

function contact(partial: Partial<Contact> & Pick<Contact, 'id' | 'regionId' | 'sentiment'>): Contact {
  return {
    fullName: 'X',
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

describe('computeRegionCoverage', () => {
  it('aggregates totals, sentiment breakdown and coverage per region', () => {
    const contacts = [
      contact({ id: '1', regionId: 'r-nord', sentiment: 'green' }),
      contact({ id: '2', regionId: 'r-nord', sentiment: 'neutral' }),
      contact({ id: '3', regionId: 'r-sued', sentiment: 'red' }),
    ]
    const cov = computeRegionCoverage(contacts)
    const nord = cov.find((r) => r.regionId === 'r-nord')!
    expect(nord.total).toBe(2)
    expect(nord.bySentiment.green).toBe(1)
    expect(nord.rated).toBe(1)
    expect(nord.coveragePct).toBe(50)
    const sued = cov.find((r) => r.regionId === 'r-sued')!
    expect(sued.coveragePct).toBe(100)
  })
})

describe('overallSummary', () => {
  it('counts engaged (non-neutral) contacts', () => {
    const s = overallSummary([
      contact({ id: '1', regionId: 'r', sentiment: 'green' }),
      contact({ id: '2', regionId: 'r', sentiment: 'neutral' }),
    ])
    expect(s).toEqual({ total: 2, engaged: 1, engagedPct: 50 })
  })
})

describe('upcomingBirthdays', () => {
  const today = new Date('2026-06-30T12:00:00.000Z')

  it('returns birthdays within the window, soonest first', () => {
    const contacts = [
      contact({ id: 'today', regionId: 'r', sentiment: 'green', birthday: '1985-06-30' }),
      contact({ id: 'soon', regionId: 'r', sentiment: 'green', birthday: '1979-07-03' }),
      contact({ id: 'far', regionId: 'r', sentiment: 'green', birthday: '1990-12-12' }),
      contact({ id: 'none', regionId: 'r', sentiment: 'green' }),
    ]
    const up = upcomingBirthdays(contacts, 30, today)
    expect(up.map((u) => u.contact.id)).toEqual(['today', 'soon'])
    expect(up[0].inDays).toBe(0)
    expect(up[1].inDays).toBe(3)
  })
})
