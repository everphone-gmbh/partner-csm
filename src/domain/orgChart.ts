import { HIERARCHY_LEVELS, type Contact, type ContactLink, type HierarchyLevel } from './types'

export const HIERARCHY_LABEL: Record<HierarchyLevel, string> = {
  top_management: 'Top-Management',
  executive: 'Executive',
  management: 'Management',
  specialist: 'Fachebene',
  assistant: 'Assistenz',
}

export interface OrgBand {
  /** undefined = „Noch nicht eingeordnet". */
  level?: HierarchyLevel
  label: string
  contacts: Contact[]
}

export interface OrgEdge {
  id: string
  /** reports_to: from = unterstellt, to = Führungskraft. */
  kind: ContactLink['kind']
  from: string
  to: string
}

export interface OrgChart {
  bands: OrgBand[]
  /** Linien, deren beide Enden in dieser Region stehen. */
  edges: OrgEdge[]
  /** Führungskraft außerhalb der Region: Kontakt-ID → Name(n) der Führungskraft. */
  externalManagers: Map<string, string[]>
}

/**
 * Das Organigramm einer Region (Entscheidung Jannik 2026-09-03):
 *
 * - Bänder je Ebene von oben nach unten, darunter „Noch nicht eingeordnet".
 * - Linien aus „berichtet an"; gestrichelt „kennt" und „beeinflusst".
 * - Wer an jemanden außerhalb der Region berichtet, bekommt dessen Namen als
 *   Hinweis statt einer Linie ins Leere.
 *
 * Reihenfolge innerhalb eines Bandes: Unterstellte stehen in der Reihenfolge
 * ihrer Führungskräfte darüber, sonst alphabetisch. Das hält die Linien kurz,
 * ohne ein Layout-Verfahren zu brauchen, das bei ein paar Dutzend Personen
 * mehr verspricht, als es hält.
 */
export function buildOrgChart(
  contacts: Contact[],
  links: ContactLink[],
  allContacts: Pick<Contact, 'id' | 'fullName'>[] = contacts,
): OrgChart {
  const inRegion = new Set(contacts.map((c) => c.id))
  const edges: OrgEdge[] = links
    .filter((l) => inRegion.has(l.fromContactId) && inRegion.has(l.toContactId))
    .map((l) => ({ id: l.id, kind: l.kind, from: l.fromContactId, to: l.toContactId }))

  const nameOf = new Map(allContacts.map((c) => [c.id, c.fullName]))
  const externalManagers = new Map<string, string[]>()
  for (const l of links) {
    if (l.kind !== 'reports_to' || !inRegion.has(l.fromContactId) || inRegion.has(l.toContactId)) continue
    const name = nameOf.get(l.toContactId)
    if (!name) continue
    externalManagers.set(l.fromContactId, [...(externalManagers.get(l.fromContactId) ?? []), name])
  }

  const managersOf = new Map<string, string[]>()
  for (const e of edges) {
    if (e.kind !== 'reports_to') continue
    managersOf.set(e.from, [...(managersOf.get(e.from) ?? []), e.to])
  }

  const byName = (a: Contact, b: Contact) => a.fullName.localeCompare(b.fullName, 'de')
  const position = new Map<string, number>()
  let counter = 0
  const place = (list: Contact[]) => {
    const rank = (c: Contact) => {
      const ms = (managersOf.get(c.id) ?? []).map((m) => position.get(m)).filter((p): p is number => p !== undefined)
      return ms.length ? Math.min(...ms) : Number.POSITIVE_INFINITY
    }
    const sorted = [...list].sort((a, b) => rank(a) - rank(b) || byName(a, b))
    for (const c of sorted) position.set(c.id, counter++)
    return sorted
  }

  const bands: OrgBand[] = []
  for (const level of HIERARCHY_LEVELS) {
    const members = contacts.filter((c) => c.hierarchyLevel === level)
    if (members.length) bands.push({ level, label: HIERARCHY_LABEL[level], contacts: place(members) })
  }
  const unplaced = contacts.filter((c) => !c.hierarchyLevel)
  if (unplaced.length) bands.push({ label: 'Noch nicht eingeordnet', contacts: place(unplaced) })

  return { bands, edges, externalManagers }
}
