import { describe, it, expect } from 'vitest'
import { computeAttentionLevel, daysSinceTouch, lastTouchDate } from './attention'
import type { Activity, Contact } from './types'

function contact(createdAt: string): Contact {
  return {
    id: 'c1',
    fullName: 'Test',
    position: 'p',
    regionId: 'r',
    relationshipManagerId: 'u',
    linkedin: { status: 'unknown' },
    sentiment: 'neutral',
    wonCustomersCount: 0,
    sideFacts: [],
    customers: [],
    createdAt,
    updatedAt: createdAt,
  }
}

function activity(contactId: string, occurredAt: string): Activity {
  return {
    id: `a-${occurredAt}`,
    contactId,
    type: 'note',
    occurredAt,
    authorId: 'u',
    authorName: 'u',
    body: '',
    attachments: [],
  }
}

describe('lastTouchDate', () => {
  it('falls back to createdAt when there is no activity', () => {
    const c = contact('2026-01-01T00:00:00.000Z')
    expect(lastTouchDate(c, [])).toBe('2026-01-01T00:00:00.000Z')
  })

  it('picks the most recent matching activity', () => {
    const c = contact('2026-01-01T00:00:00.000Z')
    const activities = [
      activity('c1', '2026-02-01T00:00:00.000Z'),
      activity('c1', '2026-03-01T00:00:00.000Z'),
      activity('other', '2026-06-01T00:00:00.000Z'), // different contact, ignored
    ]
    expect(lastTouchDate(c, activities)).toBe('2026-03-01T00:00:00.000Z')
  })

  it('compares instants, not strings (Postgres +00:00 vs client Z suffix)', () => {
    const c = contact('2026-01-01T00:00:00+00:00')
    // Same instant family, different serializations: the LATER instant must win
    // even though "2026-03-01T09:00:00+00:00" < "2026-03-01T08:00:00Z" as a string.
    const activities = [
      activity('c1', '2026-03-01T08:00:00Z'),
      activity('c1', '2026-03-01T09:00:00+00:00'),
    ]
    expect(lastTouchDate(c, activities)).toBe('2026-03-01T09:00:00+00:00')
  })
})

describe('daysSinceTouch', () => {
  it('computes whole days since the last touch', () => {
    const c = contact('2026-01-01T00:00:00.000Z')
    const today = new Date('2026-01-11T00:00:00.000Z')
    expect(daysSinceTouch(c, [], today)).toBe(10)
  })

  it('counts calendar days, independent of the time of day of the touch', () => {
    // Touch late in the evening, check early next morning: that's 1 calendar
    // day, not 0 — the 60/90-day thresholds must not flip with time of day.
    // (Local-time timestamps so the test is timezone-independent.)
    const evening = new Date(2026, 0, 1, 23, 30)
    const nextMorning = new Date(2026, 0, 2, 6, 0)
    const c = contact(evening.toISOString())
    expect(daysSinceTouch(c, [], nextMorning)).toBe(1)
  })
})

describe('computeAttentionLevel', () => {
  it('is ok under 60 days', () => {
    expect(computeAttentionLevel(0)).toBe('ok')
    expect(computeAttentionLevel(59)).toBe('ok')
  })
  it('is watch between 60 and 89 days', () => {
    expect(computeAttentionLevel(60)).toBe('watch')
    expect(computeAttentionLevel(89)).toBe('watch')
  })
  it('is attention at 90+ days', () => {
    expect(computeAttentionLevel(90)).toBe('attention')
    expect(computeAttentionLevel(200)).toBe('attention')
  })

  it('measures against an individual cadence when set', () => {
    // 30-day cadence: watch at 30, attention at 45 (1.5x).
    expect(computeAttentionLevel(29, 30)).toBe('ok')
    expect(computeAttentionLevel(30, 30)).toBe('watch')
    expect(computeAttentionLevel(44, 30)).toBe('watch')
    expect(computeAttentionLevel(45, 30)).toBe('attention')
    // A relaxed 180-day cadence keeps a 100-day gap ok.
    expect(computeAttentionLevel(100, 180)).toBe('ok')
  })
})
