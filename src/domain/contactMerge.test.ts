import { describe, expect, it } from 'vitest'
import { mergePatch, mergeRows } from './contactMerge'
import type { Contact } from './types'

function c(p: Partial<Contact>): Contact {
  return {
    id: p.id ?? 'x',
    fullName: 'Max Muster',
    position: '',
    regionId: 'r1',
    relationshipManagerId: 'u1',
    linkedin: { status: 'unknown' },
    sentiment: 'neutral',
    wonCustomersCount: 0,
    sideFacts: [],
    customers: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...p,
  }
}

describe('mergeRows / mergePatch', () => {
  const winner = c({ id: 'w', email: 'w@example.org', position: '', sentiment: 'green' })
  const loser = c({ id: 'l', email: 'l@example.org', position: 'CIO', sentiment: 'neutral' })

  it('zeigt nur, was sich unterscheidet, und markiert echte Konflikte', () => {
    const rows = mergeRows(winner, loser)
    expect(rows.map((r) => r.key)).toEqual(['position', 'email'])
    expect(rows.find((r) => r.key === 'email')?.conflict).toBe(true)
    expect(rows.find((r) => r.key === 'position')?.takesLoser).toBe(true)
  })

  it('behält eine bewertete Beziehung gegen „neutral" — neutral ist kein Wert', () => {
    expect(mergeRows(winner, loser).some((r) => r.key === 'sentiment')).toBe(false)
  })

  it('füllt Lücken des Gewinners und übernimmt bei Konflikten die Wahl', () => {
    const rows = mergeRows(winner, loser)
    expect(mergePatch(rows, {})).toEqual({ position: 'CIO' })
    expect(mergePatch(rows, { email: 'loser' })).toEqual({ position: 'CIO', email: 'l@example.org' })
  })
})
