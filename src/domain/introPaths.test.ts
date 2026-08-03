import { describe, expect, it } from 'vitest'
import type { AppUser, Contact, ContactLink } from './types'
import { findIntroPaths, MAX_HOPS } from './introPaths'

function c(id: string, partial: Partial<Contact> = {}): Contact {
  return {
    id,
    fullName: `Person ${id}`,
    position: 'P',
    regionId: 'r-1',
    relationshipManagerId: '',
    company: 'Deutsche Telekom',
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

function link(from: string, to: string, kind: ContactLink['kind'] = 'knows'): ContactLink {
  return { id: `${from}-${to}`, fromContactId: from, toContactId: to, kind }
}

const users: AppUser[] = [
  { id: 'u-alex', name: 'Alexandra', role: 'sub_admin' },
  { id: 'u-olaf', name: 'Olaf', role: 'sub_admin' },
]

describe('findIntroPaths', () => {
  it('findet den direkten Weg über den Betreuer', () => {
    const contacts = [c('ziel', { relationshipManagerId: 'u-alex' })]
    const paths = findIntroPaths('ziel', { contacts, links: [], users })
    expect(paths).toHaveLength(1)
    expect(paths[0].startUserId).toBe('u-alex')
    expect(paths[0].steps.map((s) => [s.contactId, s.label])).toEqual([['ziel', 'betreut']])
    expect(paths[0].hasInferred).toBe(false)
  })

  it('führt über eine Brücke: Kollege betreut B, B kennt das Ziel', () => {
    const contacts = [c('bruecke', { relationshipManagerId: 'u-olaf' }), c('ziel')]
    const paths = findIntroPaths('ziel', { contacts, links: [link('bruecke', 'ziel')], users })
    expect(paths).toHaveLength(1)
    expect(paths[0].startUserId).toBe('u-olaf')
    expect(paths[0].steps.map((s) => s.contactId)).toEqual(['bruecke', 'ziel'])
    expect(paths[0].steps[1].label).toBe('kennt')
    expect(paths[0].hasInferred).toBe(false)
  })

  it('gibt nichts zurück, wenn kein Weg existiert', () => {
    const contacts = [c('ziel'), c('fremd', { relationshipManagerId: 'u-alex', team: undefined })]
    expect(findIntroPaths('ziel', { contacts, links: [], users })).toEqual([])
  })

  it('gibt nichts zurück, wenn das Ziel unbekannt ist', () => {
    expect(findIntroPaths('gibtsnicht', { contacts: [c('a')], links: [], users })).toEqual([])
  })

  describe('erschlossene Team-Kante', () => {
    it('nutzt „gleiches Team", wenn nichts Belegtes existiert, und weist es aus', () => {
      const contacts = [
        c('kollege', { relationshipManagerId: 'u-alex', team: 'LE Nord / FV' }),
        c('ziel', { team: 'LE Nord / FV' }),
      ]
      const paths = findIntroPaths('ziel', { contacts, links: [], users })
      expect(paths).toHaveLength(1)
      expect(paths[0].steps.map((s) => s.label)).toEqual(['betreut', 'gleiches Team'])
      expect(paths[0].hasInferred).toBe(true)
    })

    it('bevorzugt den belegten Umweg vor der erschlossenen Abkürzung', () => {
      // Erschlossen: betreut + gleiches Team = 1 + 4 = 5.
      // Belegt: betreut + 3 Verknüpfungen = 1 + 3 = 4 → muss gewinnen.
      const contacts = [
        c('teamkollege', { relationshipManagerId: 'u-alex', team: 'LE Nord / FV' }),
        c('ziel', { team: 'LE Nord / FV' }),
        c('k1', { relationshipManagerId: 'u-olaf', team: undefined }),
        c('k2', { team: undefined }),
        c('k3', { team: undefined }),
      ]
      const links = [link('k1', 'k2'), link('k2', 'k3'), link('k3', 'ziel')]
      const paths = findIntroPaths('ziel', { contacts, links, users })
      expect(paths[0].hasInferred).toBe(false)
      expect(paths[0].steps.map((s) => s.contactId)).toEqual(['k1', 'k2', 'k3', 'ziel'])
    })

    it('verbindet KEINE Kontakte ohne Team-Angabe', () => {
      // Sonst würden alle Kontakte ohne Team zu einer Klumpen-Gruppe.
      const contacts = [
        c('kollege', { relationshipManagerId: 'u-alex', team: undefined }),
        c('ziel', { team: undefined }),
      ]
      expect(findIntroPaths('ziel', { contacts, links: [], users })).toEqual([])
    })

    it('verbindet KEINE gleichnamigen Teams verschiedener Firmen', () => {
      const contacts = [
        c('kollege', { relationshipManagerId: 'u-alex', team: 'Vertrieb', company: 'Samsung' }),
        c('ziel', { team: 'Vertrieb', company: 'Deutsche Telekom' }),
      ]
      expect(findIntroPaths('ziel', { contacts, links: [], users })).toEqual([])
    })

    it('trifft trotz abweichender Schreibweise im Team-Feld', () => {
      const contacts = [
        c('kollege', { relationshipManagerId: 'u-alex', team: 'LE Nord / FV' }),
        c('ziel', { team: 'le nord  /  fv' }),
      ]
      expect(findIntroPaths('ziel', { contacts, links: [], users })).toHaveLength(1)
    })
  })

  it('liefert mehrere Wege, günstigste zuerst', () => {
    const contacts = [
      c('direkt', { relationshipManagerId: 'u-alex', team: undefined }),
      c('weit', { relationshipManagerId: 'u-olaf', team: undefined }),
      c('mitte', { team: undefined }),
      c('ziel', { team: undefined }),
    ]
    const links = [link('direkt', 'ziel'), link('weit', 'mitte'), link('mitte', 'ziel')]
    const paths = findIntroPaths('ziel', { contacts, links, users }, { maxPaths: 2 })
    expect(paths).toHaveLength(2)
    expect(paths[0].cost).toBeLessThanOrEqual(paths[1].cost)
    expect(paths[0].startUserId).toBe('u-alex')
  })

  it('achtet auf maxPaths', () => {
    const contacts = [
      c('a', { relationshipManagerId: 'u-alex', team: undefined }),
      c('b', { relationshipManagerId: 'u-olaf', team: undefined }),
      c('ziel', { team: undefined }),
    ]
    const links = [link('a', 'ziel'), link('b', 'ziel')]
    expect(findIntroPaths('ziel', { contacts, links, users }, { maxPaths: 1 })).toHaveLength(1)
  })

  it('bricht bei zu langen Ketten ab', () => {
    const ids = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'ziel']
    const contacts = ids.map((id, i) =>
      c(id, { relationshipManagerId: i === 0 ? 'u-alex' : '', team: undefined }),
    )
    const links = ids.slice(0, -1).map((id, i) => link(id, ids[i + 1]))
    expect(findIntroPaths('ziel', { contacts, links, users }, { maxHops: 3 })).toEqual([])
    expect(findIntroPaths('ziel', { contacts, links, users }, { maxHops: 10 })).toHaveLength(1)
  })

  it('läuft bei Kreisen nicht endlos', () => {
    const contacts = [
      c('a', { relationshipManagerId: 'u-alex', team: undefined }),
      c('b', { team: undefined }),
      c('ziel', { team: undefined }),
    ]
    const links = [link('a', 'b'), link('b', 'ziel'), link('ziel', 'a'), link('b', 'a')]
    const paths = findIntroPaths('ziel', { contacts, links, users })
    expect(paths).toHaveLength(1)
    expect(paths[0].steps.map((s) => s.contactId)).toEqual(['a', 'ziel'])
  })

  it('leitet keinen Weg über ein anderes Teammitglied hinweg', () => {
    // Ein Weg darf zwischendrin nur über KONTAKTE laufen. Ein Kollege als
    // Zwischenstation wäre kein Vorstellungsweg, sondern eine Weiterleitung.
    const contacts = [
      c('vonAlex', { relationshipManagerId: 'u-alex', team: undefined }),
      c('vonOlaf', { relationshipManagerId: 'u-olaf', team: undefined }),
      c('ziel', { team: undefined }),
    ]
    const paths = findIntroPaths(
      'ziel',
      { contacts, links: [link('vonAlex', 'ziel'), link('vonOlaf', 'vonAlex')], users },
      { maxPaths: 5 },
    )
    // Beide Kollegen haben einen eigenen Weg — Olaf über seinen Kontakt.
    expect(paths.map((p) => p.startUserId)).toEqual(['u-alex', 'u-olaf'])
    // Entscheidend: jeder Weg beginnt bei genau EINEM Teammitglied, alle
    // Zwischenstationen sind Kontakte, und nur der erste Schritt ist „betreut".
    for (const path of paths) {
      expect(path.steps.every((s) => contacts.some((x) => x.id === s.contactId))).toBe(true)
      expect(path.steps[0].reason).toBe('manages')
      expect(path.steps.slice(1).every((s) => s.reason !== 'manages')).toBe(true)
    }
    // Alex' Weg ist kürzer und steht vorn.
    expect(paths[0].cost).toBeLessThan(paths[1].cost)
  })

  it('ignoriert Verknüpfungen auf nicht sichtbare Kontakte', () => {
    // Regionsbeschränkung: der Nutzer sieht 'versteckt' nicht, also darf kein
    // Weg darüber entstehen.
    const contacts = [c('ziel', { team: undefined })]
    const links = [link('versteckt', 'ziel')]
    expect(findIntroPaths('ziel', { contacts, links, users })).toEqual([])
  })

  it('MAX_HOPS ist gesetzt und plausibel', () => {
    expect(MAX_HOPS).toBeGreaterThanOrEqual(2)
    expect(MAX_HOPS).toBeLessThanOrEqual(6)
  })
})
