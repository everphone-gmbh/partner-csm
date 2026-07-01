import { describe, it, expect } from 'vitest'
import { buildHistory, filterHistory } from './timelineHistory'
import type { Activity, SentimentEntry } from '@/domain/types'

function activity(id: string, occurredAt: string, type: Activity['type'] = 'note'): Activity {
  return {
    id,
    contactId: 'c1',
    type,
    occurredAt,
    authorId: 'u',
    authorName: 'u',
    body: '',
    attachments: [],
  }
}

describe('buildHistory', () => {
  it('merges activities and sentiment entries, newest first', () => {
    const activities = [activity('a1', '2026-01-01T00:00:00.000Z'), activity('a2', '2026-03-01T00:00:00.000Z')]
    const sentiment: SentimentEntry[] = [{ at: '2026-02-01T00:00:00.000Z', value: 'green' }]
    const history = buildHistory(activities, sentiment)
    expect(history.map((e) => e.at)).toEqual([
      '2026-03-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ])
    expect(history[1].kind).toBe('sentiment')
  })

  it('defaults to an empty sentiment history', () => {
    const activities = [activity('a1', '2026-01-01T00:00:00.000Z')]
    expect(buildHistory(activities)).toHaveLength(1)
  })
})

describe('filterHistory', () => {
  const history = buildHistory(
    [activity('a1', '2026-01-01T00:00:00.000Z', 'call'), activity('a2', '2026-01-02T00:00:00.000Z', 'email')],
    [{ at: '2026-01-03T00:00:00.000Z', value: 'red' }],
  )

  it('returns everything for "all"', () => {
    expect(filterHistory(history, 'all')).toHaveLength(3)
  })

  it('filters to a specific activity type', () => {
    const calls = filterHistory(history, 'call')
    expect(calls).toHaveLength(1)
    expect(calls[0].kind).toBe('activity')
  })

  it('filters to sentiment changes only', () => {
    expect(filterHistory(history, 'sentiment')).toHaveLength(1)
  })
})
