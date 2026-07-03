import { describe, it, expect } from 'vitest'
import { completenessScore, findDuplicateContacts, IMPORTANT_FIELDS } from './dataQuality'
import type { Contact } from '@/domain/types'

function contact(partial: Partial<Contact> & Pick<Contact, 'id' | 'fullName'>): Contact {
  return {
    position: '',
    regionId: 'r',
    relationshipManagerId: 'u',
    linkedin: { status: 'unknown' },
    sentiment: 'neutral',
    wonCustomersCount: 0,
    sideFacts: [],
    customers: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('findDuplicateContacts', () => {
  it('pairs contacts with the same normalized name', () => {
    const pairs = findDuplicateContacts([
      contact({ id: '1', fullName: 'Anke Richter' }),
      contact({ id: '2', fullName: '  anke   richter ' }),
      contact({ id: '3', fullName: 'Ganz Anders' }),
    ])
    expect(pairs).toHaveLength(1)
    expect([pairs[0].a.id, pairs[0].b.id].sort()).toEqual(['1', '2'])
    expect(pairs[0].reason).toBe('Gleicher Name')
  })

  it('pairs contacts with the same email even under different names', () => {
    const pairs = findDuplicateContacts([
      contact({ id: '1', fullName: 'Anke Richter', email: 'a@example.com' }),
      contact({ id: '2', fullName: 'A. Richter', email: 'A@Example.com ' }),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].reason).toBe('Gleiche E-Mail')
  })

  it('reports a pair only once even if both name and email match', () => {
    const pairs = findDuplicateContacts([
      contact({ id: '1', fullName: 'Anke Richter', email: 'a@example.com' }),
      contact({ id: '2', fullName: 'Anke Richter', email: 'a@example.com' }),
    ])
    expect(pairs).toHaveLength(1)
  })

  it('finds nothing in a clean book', () => {
    expect(
      findDuplicateContacts([
        contact({ id: '1', fullName: 'A', email: 'a@x.de' }),
        contact({ id: '2', fullName: 'B', email: 'b@x.de' }),
      ]),
    ).toEqual([])
  })
})

describe('completenessScore', () => {
  it('is 100 when all important fields are filled', () => {
    const full = contact({
      id: '1',
      fullName: 'X',
      position: 'CIO',
      email: 'x@x.de',
      birthday: '1980-01-01',
      location: 'Bonn',
      team: 'Einkauf',
      freeText: 'Notiz',
      linkedin: { status: 'has_account', url: 'https://linkedin.com/in/x' },
      sentiment: 'green',
      sideFacts: [{ id: 's', label: 'Golf', category: 'sport' }],
    })
    expect(completenessScore(full).pct).toBe(100)
    expect(completenessScore(full).missing).toEqual([])
  })

  it('lists the missing fields with German labels', () => {
    const sparse = contact({ id: '1', fullName: 'X' })
    const score = completenessScore(sparse)
    expect(score.pct).toBeLessThan(30)
    expect(score.missing).toContain('E-Mail')
    expect(score.missing).toContain('LinkedIn geprüft')
    expect(score.missing.length).toBeLessThanOrEqual(IMPORTANT_FIELDS.length)
  })
})
