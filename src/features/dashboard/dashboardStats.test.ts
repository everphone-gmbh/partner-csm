import { describe, it, expect } from 'vitest'
import {
  birthdaysInMonth,
  computeRegionCoverage,
  overallSummary,
  upcomingAnniversaries,
  upcomingBirthdays,
} from './dashboardStats'
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

describe('upcomingAnniversaries', () => {
  const today = new Date(2026, 6, 1, 12, 0) // 2026-07-01 local

  it('finds partnership anniversaries (createdAt) within the window, >= 1 year', () => {
    const contacts = [
      contact({ id: 'five', regionId: 'r', sentiment: 'green', createdAt: '2021-07-10T09:00:00.000Z' }),
      contact({ id: 'new', regionId: 'r', sentiment: 'green', createdAt: '2026-04-01T09:00:00.000Z' }), // < 1 Jahr
      contact({ id: 'far', regionId: 'r', sentiment: 'green', createdAt: '2020-12-24T09:00:00.000Z' }),
    ]
    const up = upcomingAnniversaries(contacts, 30, today)
    expect(up.map((u) => u.contact.id)).toEqual(['five'])
    expect(up[0].years).toBe(5)
    expect(up[0].inDays).toBe(9)
  })

  it('counts the completed years at the upcoming anniversary', () => {
    const c = [contact({ id: 'one', regionId: 'r', sentiment: 'green', createdAt: '2025-07-01T09:00:00.000Z' })]
    const up = upcomingAnniversaries(c, 30, today)
    expect(up[0].years).toBe(1)
    expect(up[0].inDays).toBe(0)
  })
})

describe('birthdaysInMonth', () => {
  const contacts = [
    contact({ id: 'a', regionId: 'r', sentiment: 'green', birthday: '1979-07-03' }),
    contact({ id: 'b', regionId: 'r', sentiment: 'green', birthday: '1981-07-08' }),
    contact({ id: 'b2', regionId: 'r', sentiment: 'green', birthday: '1990-07-08' }),
    contact({ id: 'other-month', regionId: 'r', sentiment: 'green', birthday: '1985-12-24' }),
    contact({ id: 'none', regionId: 'r', sentiment: 'green' }),
  ]

  it('groups contacts by day-of-month for the displayed month', () => {
    const map = birthdaysInMonth(contacts, 2026, 6) // July (0-based month index)
    expect([...map.keys()].sort((a, b) => a - b)).toEqual([3, 8])
    expect(map.get(8)?.map((c) => c.id)).toEqual(['b', 'b2'])
  })

  it('is empty for a month without birthdays', () => {
    expect(birthdaysInMonth(contacts, 2026, 3).size).toBe(0)
  })

  it('shows Feb-29 birthdays on Feb 28 in non-leap years and Feb 29 in leap years', () => {
    const leapKid = [contact({ id: 'leap', regionId: 'r', sentiment: 'green', birthday: '1992-02-29' })]
    expect([...birthdaysInMonth(leapKid, 2026, 1).keys()]).toEqual([28])
    expect([...birthdaysInMonth(leapKid, 2028, 1).keys()]).toEqual([29])
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
