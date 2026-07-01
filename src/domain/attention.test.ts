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
})

describe('daysSinceTouch', () => {
  it('computes whole days since the last touch', () => {
    const c = contact('2026-01-01T00:00:00.000Z')
    const today = new Date('2026-01-11T00:00:00.000Z')
    expect(daysSinceTouch(c, [], today)).toBe(10)
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
})
