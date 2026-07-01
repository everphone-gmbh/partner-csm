import { describe, it, expect } from 'vitest'
import { buildPaletteItems, filterPaletteItems } from './commandPaletteItems'
import type { Contact, EventItem } from '@/domain/types'

function contact(id: string, fullName: string, position: string): Contact {
  return {
    id,
    fullName,
    position,
    regionId: 'r',
    relationshipManagerId: 'u',
    linkedin: { status: 'unknown' },
    sentiment: 'neutral',
    wonCustomersCount: 0,
    sideFacts: [],
    customers: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function event(id: string, name: string, location?: string): EventItem {
  return { id, name, date: '2026-10-01', location }
}

describe('buildPaletteItems', () => {
  it('maps contacts and events into a flat, typed list', () => {
    const items = buildPaletteItems(
      [contact('c1', 'Anke Richter', 'Leiterin')],
      [event('e1', 'Digital X', 'Köln')],
    )
    expect(items).toEqual([
      { id: 'c1', type: 'contact', title: 'Anke Richter', subtitle: 'Leiterin', to: '/contacts/c1' },
      { id: 'e1', type: 'event', title: 'Digital X', subtitle: 'Köln', to: '/events/e1' },
    ])
  })
})

describe('filterPaletteItems', () => {
  const items = buildPaletteItems(
    [contact('c1', 'Anke Richter', 'Leiterin Partner Management'), contact('c2', 'Thomas Berger', 'Procurement')],
    [event('e1', 'Digital X', 'Köln')],
  )

  it('returns the first N items for an empty query', () => {
    expect(filterPaletteItems(items, '', 2)).toHaveLength(2)
  })

  it('matches on title case-insensitively', () => {
    const result = filterPaletteItems(items, 'anke')
    expect(result.map((i) => i.id)).toEqual(['c1'])
  })

  it('matches on subtitle too', () => {
    const result = filterPaletteItems(items, 'procurement')
    expect(result.map((i) => i.id)).toEqual(['c2'])
  })

  it('caps results at the limit', () => {
    expect(filterPaletteItems(items, '', 1)).toHaveLength(1)
  })
})
