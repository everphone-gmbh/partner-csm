import { describe, expect, it } from 'vitest'
import { buildOrgChart } from './orgChart'
import type { Contact, ContactLink } from './types'

function c(id: string, fullName: string, hierarchyLevel?: Contact['hierarchyLevel']): Contact {
  return {
    id,
    fullName,
    position: '',
    regionId: 'r1',
    relationshipManagerId: 'u1',
    hierarchyLevel,
    linkedin: { status: 'unknown' },
    sentiment: 'neutral',
    wonCustomersCount: 0,
    sideFacts: [],
    customers: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
const link = (id: string, from: string, to: string, kind: ContactLink['kind'] = 'reports_to'): ContactLink => ({
  id,
  fromContactId: from,
  toContactId: to,
  kind,
})

describe('buildOrgChart', () => {
  const chef = c('chef', 'Zora Chefin', 'top_management')
  const m1 = c('m1', 'Anton Manager', 'management')
  const m2 = c('m2', 'Berta Managerin', 'management')
  const f1 = c('f1', 'Carl Fach', 'specialist')
  const f2 = c('f2', 'Dora Fach', 'specialist')
  const offen = c('x', 'Erik Offen')

  it('ordnet in Ebenen von oben nach unten, Uneingeordnete zuletzt', () => {
    const chart = buildOrgChart([f1, offen, m1, chef], [])
    expect(chart.bands.map((b) => b.label)).toEqual([
      'Top-Management',
      'Management',
      'Fachebene',
      'Noch nicht eingeordnet',
    ])
  })

  it('stellt Unterstellte in der Reihenfolge ihrer Führungskräfte auf', () => {
    // Berta führt Carl, Anton führt Dora — alphabetisch stünde Anton vorn,
    // also muss Dora vor Carl stehen, damit die Linien sich nicht kreuzen.
    const chart = buildOrgChart([m1, m2, f1, f2], [link('l1', 'f1', 'm2'), link('l2', 'f2', 'm1')])
    const fach = chart.bands.find((b) => b.level === 'specialist')!
    expect(fach.contacts.map((x) => x.id)).toEqual(['f2', 'f1'])
  })

  it('zieht Linien nur zwischen Personen dieser Region', () => {
    const chart = buildOrgChart(
      [m1, f1],
      [link('l1', 'f1', 'm1'), link('l2', 'f1', 'fremd'), link('l3', 'm1', 'f1', 'knows')],
    )
    expect(chart.edges.map((e) => e.id).sort()).toEqual(['l1', 'l3'])
  })

  it('nennt eine Führungskraft außerhalb der Region, statt eine Linie ins Leere zu ziehen', () => {
    const chart = buildOrgChart([f1], [link('l1', 'f1', 'fremd')], [f1, c('fremd', 'Fritz Fremd')])
    expect(chart.externalManagers.get('f1')).toEqual(['Fritz Fremd'])
    expect(chart.edges).toEqual([])
  })
})
