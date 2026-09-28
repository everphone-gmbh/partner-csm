import { describe, expect, it } from 'vitest'
import {
  defaultSenderIds,
  distinctCompanies,
  filterRecipients,
  giftFunnel,
  isAddressMissing,
  recipientName,
  sortOccasions,
  sortRecipients,
  sortSenders,
} from './gifts'
import type { GiftOccasion, GiftRecipient } from './types'

function r(p: Partial<GiftRecipient>): GiftRecipient {
  return {
    id: p.id ?? 'x',
    occasionId: 'o1',
    shipping: 'direkt',
    status: 'geplant',
    senderIds: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    ...p,
  }
}

describe('giftFunnel', () => {
  it('zählt kumulativ: jede Stufe enthält alle, die mindestens so weit sind', () => {
    const f = giftFunnel([
      r({ status: 'geplant' }),
      r({ status: 'bestellt' }),
      r({ status: 'versandt' }),
      r({ status: 'zugestellt' }),
      r({ status: 'zugestellt' }),
    ])
    expect(f).toEqual({ geplant: 5, bestellt: 4, versandt: 3, zugestellt: 2 })
  })

  it('ist bei einer leeren Liste überall null', () => {
    expect(giftFunnel([])).toEqual({ geplant: 0, bestellt: 0, versandt: 0, zugestellt: 0 })
  })
})

describe('isAddressMissing', () => {
  it('meldet eine unvollständige Adresse bei Direktversand', () => {
    expect(isAddressMissing(r({ street: 'Weg 1', postalCode: '12345' }))).toBe(true)
    expect(isAddressMissing(r({ street: 'Weg 1', postalCode: '12345', city: 'Ort' }))).toBe(false)
  })

  it('verlangt bei „Via EP" keine Adresse — die läuft über den Ansprechpartner', () => {
    expect(isAddressMissing(r({ shipping: 'via_ep' }))).toBe(false)
  })
})

describe('Anzeige und Sortierung', () => {
  it('baut den Namen aus dem, was da ist', () => {
    expect(recipientName({ firstName: 'Anna', lastName: 'Weber' })).toBe('Anna Weber')
    expect(recipientName({ lastName: 'Weber' })).toBe('Weber')
    expect(recipientName({})).toBe('Ohne Namen')
  })

  it('sortiert nach Firma, dann Nachname', () => {
    const sorted = sortRecipients([
      r({ id: '1', company: 'Zeta', lastName: 'A' }),
      r({ id: '2', company: 'alpha', lastName: 'B' }),
      r({ id: '3', company: 'Alpha', lastName: 'A' }),
    ])
    expect(sorted.map((x) => x.id)).toEqual(['3', '2', '1'])
  })

  it('zählt Firmen ohne Groß/Klein- und Leerzeichen-Dubletten', () => {
    expect(
      distinctCompanies([r({ company: 'Nordlicht AG' }), r({ company: ' nordlicht  ag' }), r({})]),
    ).toBe(1)
  })

  it('stellt C-Level-Absender nach vorn und nimmt sie als Voreinstellung', () => {
    const senders = [
      { id: 's1', name: 'Moritz', isCLevel: false },
      { id: 's2', name: 'Mira', isCLevel: true },
      { id: 's3', name: 'Jonas', isCLevel: true },
    ]
    expect(sortSenders(senders).map((s) => s.name)).toEqual(['Jonas', 'Mira', 'Moritz'])
    expect(defaultSenderIds(senders)).toEqual(['s2', 's3'])
  })

  it('stellt den laufenden Geburtstags-Anlass ans Ende, Weihnachten neueste zuerst', () => {
    const o = (name: string, kind: GiftOccasion['kind']): GiftOccasion => ({
      id: name,
      name,
      kind,
      createdAt: '2026-01-01',
    })
    const sorted = sortOccasions([
      o('Geburtstage', 'geburtstag'),
      o('Weihnachten 2025/26', 'weihnachten'),
      o('Weihnachten 2026/27', 'weihnachten'),
    ])
    expect(sorted.map((x) => x.name)).toEqual([
      'Weihnachten 2026/27',
      'Weihnachten 2025/26',
      'Geburtstage',
    ])
  })
})

describe('filterRecipients', () => {
  const list = [
    r({ id: '1', productId: 'p1', senderIds: ['s1'], status: 'geplant', company: 'Nordlicht AG' }),
    r({ id: '2', productId: 'p2', senderIds: ['s2'], status: 'versandt', lastName: 'Weber' }),
  ]
  it.each([
    [{ productId: 'p1' }, ['1']],
    [{ senderId: 's2' }, ['2']],
    [{ status: 'versandt' as const }, ['2']],
    [{ query: 'nordl' }, ['1']],
    [{ query: 'WEBER' }, ['2']],
    [{}, ['1', '2']],
  ])('filtert %j', (f, ids) => {
    expect(filterRecipients(list, f).map((x) => x.id)).toEqual(ids)
  })
})
