import { describe, expect, it } from 'vitest'
import type { Contact, Region } from './types'
import { describeGaps, findGaps, isBlank, isPlaceholderRegion, isUnassigned } from './placeholders'

const REGIONS: Region[] = [
  { id: 'r-nord', name: 'Nord', isPlaceholder: false },
  { id: 'r-leer', name: 'Unbekannt', isPlaceholder: true },
  // Gleicher Name, aber NICHT gekennzeichnet: die Erkennung darf sich nicht am
  // Namen orientieren, sonst hebelt eine Umbenennung sie aus.
  { id: 'r-namensgleich', name: 'Unbekannt', isPlaceholder: false },
]

function contact(over: Partial<Contact> = {}): Contact {
  return {
    id: 'c-1',
    fullName: 'Test Person',
    position: 'Leitung',
    regionId: 'r-nord',
    relationshipManagerId: 'u-1',
    team: 'Team A',
    linkedin: { status: 'unknown' },
    sentiment: 'neutral',
    wonCustomersCount: 0,
    sideFacts: [],
    customers: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('isBlank', () => {
  it('behandelt leeren String wie fehlend — die Falle dieses Datenbestands', () => {
    // 458 Positionen sind '' statt NULL; count(position) liefert deshalb 671.
    expect(isBlank('')).toBe(true)
    expect(isBlank('   ')).toBe(true)
    expect(isBlank(undefined)).toBe(true)
    expect(isBlank(null)).toBe(true)
    expect(isBlank('Leitung')).toBe(false)
  })
})

describe('isPlaceholderRegion', () => {
  it('richtet sich nach dem Kennzeichen, nicht nach dem Namen', () => {
    expect(isPlaceholderRegion('r-leer', REGIONS)).toBe(true)
    expect(isPlaceholderRegion('r-namensgleich', REGIONS)).toBe(false)
    expect(isPlaceholderRegion('r-nord', REGIONS)).toBe(false)
  })

  it('meldet eine unbekannte Region-ID nicht als Platzhalter', () => {
    // Sonst zeigte ein Ladefehler den ganzen Bestand als „unzugeordnet" an.
    expect(isPlaceholderRegion('gibt-es-nicht', REGIONS)).toBe(false)
    expect(isPlaceholderRegion('r-nord', [])).toBe(false)
  })
})

describe('findGaps', () => {
  it('findet nichts an einem vollständigen Kontakt', () => {
    expect(findGaps(contact(), REGIONS)).toEqual([])
  })

  it('nennt Region und Betreuer zuerst', () => {
    const gaps = findGaps(
      contact({ regionId: 'r-leer', relationshipManagerId: '', position: '', team: '' }),
      REGIONS,
    )
    expect(gaps).toEqual(['region', 'manager', 'position', 'team'])
  })

  it('erkennt eine fehlende Position trotz gesetzter Region und Betreuung', () => {
    expect(findGaps(contact({ position: '  ' }), REGIONS)).toEqual(['position'])
  })
})

describe('isUnassigned', () => {
  it('greift bei Platzhalter-Region oder fehlendem Betreuer', () => {
    expect(isUnassigned(contact({ regionId: 'r-leer' }), REGIONS)).toBe(true)
    expect(isUnassigned(contact({ relationshipManagerId: '' }), REGIONS)).toBe(true)
  })

  it('zählt eine fehlende Position NICHT als unzugeordnet', () => {
    // Sonst wären zwei Drittel des Bestands „unzugeordnet" und der Filter für
    // die Massenzuordnung nutzlos.
    expect(isUnassigned(contact({ position: '', team: '' }), REGIONS)).toBe(false)
  })
})

describe('describeGaps', () => {
  it('formuliert Ein- und Mehrzahl lesbar', () => {
    expect(describeGaps([])).toBe('')
    expect(describeGaps(['manager'])).toBe('Betreuer fehlt')
    expect(describeGaps(['region', 'manager'])).toBe('Region und Betreuer fehlen')
    expect(describeGaps(['region', 'manager', 'position'])).toBe(
      'Region, Betreuer und Position fehlen',
    )
  })
})
