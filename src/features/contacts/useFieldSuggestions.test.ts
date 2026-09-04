import { describe, expect, it } from 'vitest'
import type { Contact, OrgUnit } from '@/domain/types'
import { collectSuggestions, uniqueSorted } from './useFieldSuggestions'

function contact(overrides: Partial<Contact>): Contact {
  return {
    id: 'c',
    fullName: 'Test',
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
    ...overrides,
  }
}

describe('uniqueSorted', () => {
  it('trimmt, wirft Leeres weg und sortiert deutsch', () => {
    expect(uniqueSorted(['  Zebra ', '', null, undefined, 'Ärzte', '   ', 'apfel'])).toEqual([
      'apfel',
      'Ärzte',
      'Zebra',
    ])
  })

  it('zählt Groß-/Kleinschreibung nicht als Unterschied — die erste Schreibweise gewinnt', () => {
    expect(uniqueSorted(['Partner Management', 'partner management', 'PARTNER MANAGEMENT'])).toEqual([
      'Partner Management',
    ])
  })

  it('fasst mehrfache Leerzeichen zusammen, damit Tippvarianten nicht doppelt erscheinen', () => {
    expect(uniqueSorted(['Einkauf  Konzern', 'Einkauf Konzern'])).toEqual(['Einkauf Konzern'])
  })
})

describe('collectSuggestions', () => {
  const orgUnits: OrgUnit[] = [
    { id: 'ou-1', company: 'Deutsche Telekom', department: 'Partner Management', team: null },
    { id: 'ou-2', company: 'Deutsche Telekom', department: 'Einkauf Konzern', team: null },
    { id: 'ou-3', company: 'Deutsche Telekom', department: 'Einkauf Konzern', team: 'Mobilfunk' },
  ]
  const contacts: Contact[] = [
    // Kleingeschrieben: muss mit der org_unit verschmelzen, deren Schreibweise gewinnt.
    contact({ id: 'a', team: 'partner management', company: 'deutsche telekom' }),
    contact({ id: 'b', team: 'Sales Leadership', company: 'Samsung' }),
    contact({ id: 'c', team: undefined, company: undefined }),
    contact({ id: 'd', team: '', company: ' ' }),
  ]

  it('bildet Team-Vorschläge im Format des Team-Felds („Abteilung / Team“), nicht aus dem nackten Team', () => {
    const { teams } = collectSuggestions(contacts, orgUnits)
    expect(teams).toEqual([
      'Einkauf Konzern',
      'Einkauf Konzern / Mobilfunk',
      'Partner Management',
      'Sales Leadership',
    ])
    expect(teams).not.toContain('Mobilfunk')
  })

  it('vereinigt Firmen aus Soll-Struktur und Kontakten, eindeutig und sortiert', () => {
    expect(collectSuggestions(contacts, orgUnits).companies).toEqual(['Deutsche Telekom', 'Samsung'])
  })

  it('liefert leere Listen ohne Daten', () => {
    expect(collectSuggestions([], [])).toEqual({ teams: [], companies: [] })
  })
})
