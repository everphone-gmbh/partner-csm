import { describe, it, expect } from 'vitest'
import { activitiesPerWeek, portfolioSentiment } from './monitoringStats'
import type { Activity, Contact } from '@/domain/types'

function contact(id: string, sentiment: Contact['sentiment']): Contact {
  return {
    id,
    fullName: 'X',
    position: 'P',
    regionId: 'r',
    relationshipManagerId: 'u',
    linkedin: { status: 'unknown' },
    sentiment,
    wonCustomersCount: 0,
    sideFacts: [],
    customers: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function activity(occurredAt: string): Activity {
  return {
    id: `a-${occurredAt}`,
    contactId: 'c',
    type: 'note',
    occurredAt,
    authorId: 'u',
    authorName: 'U',
    body: '',
    attachments: [],
  }
}

describe('portfolioSentiment', () => {
  it('counts contacts per traffic-light value', () => {
    const split = portfolioSentiment([
      contact('1', 'green'),
      contact('2', 'green'),
      contact('3', 'amber'),
      contact('4', 'neutral'),
    ])
    expect(split).toEqual({ green: 2, amber: 1, red: 0, neutral: 1 })
  })
})

describe('activitiesPerWeek', () => {
  // Wed 2026-07-01 12:00 local — current week starts Mon 2026-06-29.
  const today = new Date(2026, 6, 1, 12, 0)

  it('buckets activities into ISO-Monday weeks, oldest first, current week last', () => {
    const activities = [
      activity(new Date(2026, 5, 30, 9, 0).toISOString()), // Tue this week
      activity(new Date(2026, 6, 1, 8, 0).toISOString()), // Wed this week
      activity(new Date(2026, 5, 24, 9, 0).toISOString()), // last week
      activity(new Date(2026, 5, 1, 9, 0).toISOString()), // 4 weeks back
    ]
    const weeks = activitiesPerWeek(activities, 6, today)
    expect(weeks).toHaveLength(6)
    expect(weeks[weeks.length - 1].count).toBe(2) // current week
    expect(weeks[weeks.length - 2].count).toBe(1) // previous week
    expect(weeks.reduce((s, w) => s + w.count, 0)).toBe(4)
    // Week start labels are the Mondays
    expect(weeks[weeks.length - 1].weekStart.getDay()).toBe(1)
  })

  it('ignores activities older than the window', () => {
    const weeks = activitiesPerWeek([activity(new Date(2025, 0, 1).toISOString())], 4, today)
    expect(weeks.reduce((s, w) => s + w.count, 0)).toBe(0)
  })
})
