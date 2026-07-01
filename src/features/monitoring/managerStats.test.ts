import { describe, it, expect } from 'vitest'
import { computeManagerRanking } from './managerStats'
import type { Activity, AppUser, Contact } from '@/domain/types'

const users: AppUser[] = [
  { id: 'rm1', name: 'RM One', role: 'sub_admin', regionId: 'r-nord' },
  { id: 'rm2', name: 'RM Two', role: 'sub_admin', regionId: 'r-sued' },
  { id: 'am1', name: 'AM', role: 'account_manager', regionId: 'r-west' },
]

function contact(id: string, rm: string, sentiment: Contact['sentiment']): Contact {
  return {
    id,
    fullName: id,
    position: 'p',
    regionId: 'r-nord',
    relationshipManagerId: rm,
    linkedin: { status: 'unknown' },
    sentiment,
    wonCustomersCount: 0,
    sideFacts: [],
    customers: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function activity(author: string): Activity {
  return {
    id: `a-${author}-${Math.round(Math.random() * 0)}`,
    contactId: 'c',
    type: 'note',
    occurredAt: '2026-01-01T00:00:00.000Z',
    authorId: author,
    authorName: author,
    body: '',
    attachments: [],
  }
}

describe('computeManagerRanking', () => {
  it('ranks only RMs (sub_admin) by coverage then activity', () => {
    const contacts = [
      contact('c1', 'rm1', 'green'),
      contact('c2', 'rm1', 'green'),
      contact('c3', 'rm2', 'green'),
      contact('c4', 'rm2', 'neutral'),
    ]
    const activities = [activity('rm1'), activity('rm2'), activity('rm2')]
    const ranking = computeManagerRanking(users, contacts, activities)

    expect(ranking).toHaveLength(2) // AM excluded
    expect(ranking[0].user.id).toBe('rm1') // 100% coverage beats 50%
    expect(ranking[0].engagedPct).toBe(100)
    expect(ranking[1].user.id).toBe('rm2')
    expect(ranking[1].engagedPct).toBe(50)
    expect(ranking[1].activities).toBe(2)
  })
})
