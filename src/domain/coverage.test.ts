import { describe, expect, it } from 'vitest'
import type { Activity, Contact, OrgUnit } from './types'
import { buildCoverage, normalizeUnitKey, TOUCH_WINDOW_DAYS, unitKey } from './coverage'

function unit(department: string, team: string | null, company = 'Deutsche Telekom'): OrgUnit {
  return { id: `${department}/${team ?? ''}`, company, department, team }
}

function contact(partial: Partial<Contact> & Pick<Contact, 'id'>): Contact {
  return {
    fullName: `Person ${partial.id}`,
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

function activity(contactId: string, occurredAt: string): Activity {
  return {
    id: `a-${contactId}-${occurredAt}`,
    contactId,
    type: 'meeting',
    occurredAt,
    authorId: 'u',
    authorName: 'U',
    body: '',
    attachments: [],
  }
}

const TODAY = new Date('2026-07-29T12:00:00.000Z')

describe('normalizeUnitKey', () => {
  it('macht Schreibweisen vergleichbar', () => {
    expect(normalizeUnitKey('  LE   Nord ')).toBe('le nord')
    expect(normalizeUnitKey('LE Nord')).toBe(normalizeUnitKey('le  nord'))
  })

  it('normalisiert Tabulatoren — die stecken echt in Salesforce-Daten', () => {
    expect(normalizeUnitKey('Fachvertrieb\t/ TOP Accounts')).toBe('fachvertrieb / top accounts')
  })

  it('behandelt fehlende Werte als leer', () => {
    expect(normalizeUnitKey(undefined)).toBe('')
    expect(normalizeUnitKey(null)).toBe('')
  })
})

describe('unitKey', () => {
  it('bildet „Abteilung / Team" wie in contacts.team', () => {
    expect(unitKey('Deutsche Telekom', 'LE Nord', 'Fachvertrieb Mobilfunk')).toBe(
      'deutsche telekom|le nord / fachvertrieb mobilfunk',
    )
  })

  it('nutzt auf Abteilungsebene nur die Abteilung', () => {
    expect(unitKey('Deutsche Telekom', 'TOP Accounts', null)).toBe('deutsche telekom|top accounts')
  })
})

describe('buildCoverage', () => {
  const units = [
    unit('LE Nord', 'Fachvertrieb Mobilfunk'),
    unit('LE Süd', 'Fachvertrieb Mobilfunk'),
    unit('TOP Accounts', null),
  ]

  it('erkennt eine Einheit ohne jeden Kontakt als echte Lücke', () => {
    const { rows, summary } = buildCoverage(units, [], [], TODAY)
    expect(rows.every((r) => r.status === 'none')).toBe(true)
    expect(summary.units).toBe(3)
    expect(summary.unitsWithoutContact).toBe(3)
    expect(summary.unitsCovered).toBe(0)
  })

  it('unterscheidet „nur Namen", „angefangen" und „abgedeckt"', () => {
    const contacts = [
      // Namen vorhanden, kein Betreuer
      contact({ id: 'n1', team: 'LE Nord / Fachvertrieb Mobilfunk' }),
      // betreut, aber unbewertet
      contact({
        id: 's1',
        team: 'LE Süd / Fachvertrieb Mobilfunk',
        relationshipManagerId: 'u-olaf',
      }),
      // betreut UND bewertet
      contact({
        id: 't1',
        team: 'TOP Accounts',
        relationshipManagerId: 'u-alex',
        sentiment: 'green',
      }),
    ]
    const { rows, summary } = buildCoverage(units, contacts, [], TODAY)
    const byDept = new Map(rows.map((r) => [r.department, r]))
    expect(byDept.get('LE Nord')!.status).toBe('listed')
    expect(byDept.get('LE Süd')!.status).toBe('started')
    expect(byDept.get('TOP Accounts')!.status).toBe('covered')
    expect(summary.unitsWithoutContact).toBe(0)
    expect(summary.unitsWithoutManager).toBe(1)
    expect(summary.unitsCovered).toBe(1)
  })

  it('trifft trotz abweichender Schreibweise im Team-Feld', () => {
    const contacts = [contact({ id: 'x', team: 'le nord  /  Fachvertrieb Mobilfunk' })]
    const { rows } = buildCoverage(units, contacts, [], TODAY)
    expect(rows.find((r) => r.department === 'LE Nord')!.contacts).toBe(1)
  })

  it('trennt Einheiten mit gleichem Team-Namen nach Abteilung', () => {
    // „Fachvertrieb Mobilfunk" gibt es in fast jeder Abteilung — die Zuordnung
    // darf nicht am Teamnamen allein hängen.
    const contacts = [
      contact({ id: 'a', team: 'LE Nord / Fachvertrieb Mobilfunk' }),
      contact({ id: 'b', team: 'LE Süd / Fachvertrieb Mobilfunk' }),
    ]
    const { rows } = buildCoverage(units, contacts, [], TODAY)
    expect(rows.find((r) => r.department === 'LE Nord')!.contacts).toBe(1)
    expect(rows.find((r) => r.department === 'LE Süd')!.contacts).toBe(1)
  })

  it('trennt gleiche Abteilungsnamen bei verschiedenen Firmen', () => {
    const twoCompanies = [unit('Vertrieb', null), unit('Vertrieb', null, 'Samsung')]
    const contacts = [
      contact({ id: 'dt', team: 'Vertrieb', company: 'Deutsche Telekom' }),
      contact({ id: 'sam', team: 'Vertrieb', company: 'Samsung' }),
    ]
    const { rows } = buildCoverage(twoCompanies, contacts, [], TODAY)
    expect(rows.find((r) => r.company === 'Deutsche Telekom')!.contacts).toBe(1)
    expect(rows.find((r) => r.company === 'Samsung')!.contacts).toBe(1)
  })

  it('zählt nur Kontakte mit Aktivität im Zeitfenster als angesprochen', () => {
    const contacts = [
      contact({ id: 'frisch', team: 'TOP Accounts' }),
      contact({ id: 'alt', team: 'TOP Accounts' }),
    ]
    const inWindow = new Date(TODAY.getTime() - 10 * 86_400_000).toISOString()
    const tooOld = new Date(TODAY.getTime() - (TOUCH_WINDOW_DAYS + 5) * 86_400_000).toISOString()
    const { rows } = buildCoverage(
      units,
      contacts,
      [activity('frisch', inWindow), activity('alt', tooOld)],
      TODAY,
    )
    const top = rows.find((r) => r.department === 'TOP Accounts')!
    expect(top.contacts).toBe(2)
    expect(top.touched).toBe(1)
  })

  it('verschweigt Kontakte außerhalb der Soll-Struktur nicht, sondern listet sie separat', () => {
    const contacts = [
      contact({ id: 'fremd', team: 'Irgendein SF-Freitext', relationshipManagerId: 'u-alex' }),
    ]
    const { rows, summary } = buildCoverage(units, contacts, [], TODAY)
    const extra = rows.find((r) => r.unlisted)
    expect(extra).toBeDefined()
    expect(extra!.department).toBe('Irgendein SF-Freitext')
    expect(extra!.contacts).toBe(1)
    // Die Quote bezieht sich nur auf die Soll-Struktur.
    expect(summary.units).toBe(3)
  })

  it('bündelt Kontakte ohne Team-Angabe in einer eigenen Zeile', () => {
    const contacts = [contact({ id: 'o1' }), contact({ id: 'o2' })]
    const { rows } = buildCoverage(units, contacts, [], TODAY)
    const ohne = rows.find((r) => r.department === 'Ohne Team-Angabe')
    expect(ohne?.contacts).toBe(2)
    expect(ohne?.unlisted).toBe(true)
  })

  it('sortiert Soll-Einheiten vor Fundstücke', () => {
    const contacts = [contact({ id: 'fremd', team: 'AAA Freitext' })]
    const { rows } = buildCoverage(units, contacts, [], TODAY)
    // Trotz alphabetischem Vorrang steht das Fundstück hinten.
    expect(rows[rows.length - 1].unlisted).toBe(true)
    expect(rows.slice(0, -1).every((r) => !r.unlisted)).toBe(true)
  })
})
