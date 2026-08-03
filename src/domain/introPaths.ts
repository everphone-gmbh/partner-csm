import type { AppUser, Contact, ContactLink } from './types'
import { describeLink } from './contactLinks'

/**
 * Vorstellungspfade: „Wie komme ich an diese Person heran?"
 *
 * Sucht den kürzesten Weg von jemandem aus unserem Team zum Zielkontakt.
 * Idee aus Relationship-Intelligence-Werkzeugen, dort aus E-Mail-/Kalender-
 * verkehr gespeist. Diese Anbindung fehlt hier bewusst (läuft über
 * Salesforce), deshalb speist sich der Graph aus drei Quellen:
 *
 *   betreut       Betreuer eines Kontakts          → belegt
 *   Verknüpfung   contact_links (kennt/…)          → belegt
 *   gleiches Team gleiche Firma UND gleiches Team  → ERSCHLOSSEN
 *
 * Die erschlossene Kante ist nötig, damit das Feature überhaupt etwas
 * liefert, solange kaum Verknüpfungen gepflegt sind — sie ist aber eine
 * Vermutung („die kennen sich vermutlich, sie sitzen im selben Team") und
 * wird darum teurer gewichtet und in der Oberfläche als solche ausgewiesen.
 * Belegte Wege gewinnen dadurch immer, auch wenn sie länger sind.
 */

export type IntroReason = 'manages' | 'link' | 'same_team'

const WEIGHT: Record<IntroReason, number> = {
  manages: 1,
  link: 1,
  // Höher als drei belegte Schritte: ein bestätigter Umweg ist besser als
  // eine Abkürzung, die nur vermutet ist.
  same_team: 4,
}

/** Erschlossene Kanten sind Vermutungen, keine bestätigten Beziehungen. */
export const INFERRED: Record<IntroReason, boolean> = {
  manages: false,
  link: false,
  same_team: true,
}

/** Mehr Zwischenstationen sind praktisch nicht mehr vermittelbar. */
export const MAX_HOPS = 4

export interface IntroStep {
  /** Kontakt, der mit diesem Schritt erreicht wird. */
  contactId: string
  reason: IntroReason
  /** Wie der Schritt zu lesen ist, z. B. „betreut", „kennt". */
  label: string
  inferred: boolean
}

export interface IntroPath {
  /** Person aus unserem Team, bei der der Weg beginnt. */
  startUserId: string
  steps: IntroStep[]
  cost: number
  /** true, wenn mindestens ein Schritt nur erschlossen ist. */
  hasInferred: boolean
}

interface GraphEdge {
  to: string
  reason: IntroReason
  label: string
}

const contactNode = (id: string) => `c:${id}`
const userNode = (id: string) => `u:${id}`

/**
 * Baut den ungerichteten Graphen. Bewusst ungerichtet: für eine Vorstellung
 * ist die Richtung einer Verknüpfung unerheblich — wer jemanden kennt, kann
 * in beide Richtungen vermitteln.
 */
export function buildIntroGraph(
  contacts: Contact[],
  links: ContactLink[],
): Map<string, GraphEdge[]> {
  const graph = new Map<string, GraphEdge[]>()
  const add = (from: string, edge: GraphEdge) => {
    const list = graph.get(from)
    if (list) list.push(edge)
    else graph.set(from, [edge])
  }
  const known = new Set(contacts.map((c) => c.id))

  // 1. Betreuung: unser Team → Kontakt
  for (const contact of contacts) {
    if (!contact.relationshipManagerId) continue
    add(userNode(contact.relationshipManagerId), {
      to: contactNode(contact.id),
      reason: 'manages',
      label: 'betreut',
    })
    add(contactNode(contact.id), {
      to: userNode(contact.relationshipManagerId),
      reason: 'manages',
      label: 'wird betreut von',
    })
  }

  // 2. Gepflegte Verknüpfungen zwischen Kontakten
  for (const link of links) {
    // Verknüpfungen auf unsichtbare Kontakte überspringen, sonst entstehen
    // Wege über Personen, die der Nutzer gar nicht sehen darf.
    if (!known.has(link.fromContactId) || !known.has(link.toContactId)) continue
    const forward = describeLink(link, link.fromContactId)
    const inverse = describeLink(link, link.toContactId)
    if (forward) {
      add(contactNode(link.fromContactId), {
        to: contactNode(forward.otherContactId),
        reason: 'link',
        label: forward.label,
      })
    }
    if (inverse) {
      add(contactNode(link.toContactId), {
        to: contactNode(inverse.otherContactId),
        reason: 'link',
        label: inverse.label,
      })
    }
  }

  // 3. Gleiches Team derselben Firma — erschlossen.
  // Ohne Team-Angabe KEINE Kante: sonst würden die Hunderte Kontakte ohne
  // Team zu einer einzigen Klumpen-Gruppe und jeder Weg liefe über sie.
  const byTeam = new Map<string, string[]>()
  const norm = (v?: string) => (v ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  for (const contact of contacts) {
    const team = norm(contact.team)
    const company = norm(contact.company)
    if (!team || !company) continue
    const key = `${company}|${team}`
    const list = byTeam.get(key)
    if (list) list.push(contact.id)
    else byTeam.set(key, [contact.id])
  }
  for (const members of byTeam.values()) {
    if (members.length < 2) continue
    for (const a of members) {
      for (const b of members) {
        if (a === b) continue
        add(contactNode(a), { to: contactNode(b), reason: 'same_team', label: 'gleiches Team' })
      }
    }
  }

  return graph
}

/**
 * Beste Wege von unserem Team zum Zielkontakt, günstigste zuerst.
 *
 * Dijkstra vom Ziel aus: der Graph ist ungerichtet, und so findet ein Lauf
 * die Wege zu ALLEN Teammitgliedern gleichzeitig statt einen pro Person.
 */
export function findIntroPaths(
  targetContactId: string,
  data: { contacts: Contact[]; links: ContactLink[]; users: AppUser[] },
  options: { maxPaths?: number; maxHops?: number } = {},
): IntroPath[] {
  const maxPaths = options.maxPaths ?? 3
  const maxHops = options.maxHops ?? MAX_HOPS
  if (!data.contacts.some((c) => c.id === targetContactId)) return []

  const graph = buildIntroGraph(data.contacts, data.links)
  const userIds = new Set(data.users.map((u) => u.id))
  const start = contactNode(targetContactId)

  interface Visit {
    cost: number
    hops: number
    /** Schritt, der HIERHER führte — vom Ziel aus gesehen. */
    via?: { from: string; reason: IntroReason; label: string }
  }
  const best = new Map<string, Visit>([[start, { cost: 0, hops: 0 }]])
  // Kleine Graphen (wenige Tausend Kanten): eine sortierte Liste genügt,
  // eine Prioritätswarteschlange wäre hier unnötige Komplexität.
  const queue: string[] = [start]
  const done = new Set<string>()
  const reachedUsers: { node: string; cost: number }[] = []

  while (queue.length > 0) {
    queue.sort((a, b) => best.get(a)!.cost - best.get(b)!.cost)
    const node = queue.shift()!
    if (done.has(node)) continue
    done.add(node)
    const here = best.get(node)!

    // Teammitglied erreicht — von hier nicht weitersuchen: ein Weg, der über
    // einen Kollegen zu einem anderen führt, ist kein Vorstellungsweg.
    if (node.startsWith('u:')) {
      if (userIds.has(node.slice(2))) reachedUsers.push({ node, cost: here.cost })
      continue
    }
    if (here.hops >= maxHops) continue

    for (const edge of graph.get(node) ?? []) {
      if (done.has(edge.to)) continue
      const cost = here.cost + WEIGHT[edge.reason]
      const known = best.get(edge.to)
      if (!known || cost < known.cost) {
        best.set(edge.to, {
          cost,
          hops: here.hops + 1,
          via: { from: node, reason: edge.reason, label: edge.label },
        })
        queue.push(edge.to)
      }
    }
  }

  // Wege rekonstruieren: vom Teammitglied zurück zum Ziel.
  const paths: IntroPath[] = []
  for (const { node, cost } of reachedUsers.sort((a, b) => a.cost - b.cost)) {
    const steps: IntroStep[] = []
    let cursor = node
    let guard = 0
    while (guard++ <= maxHops + 1) {
      const visit = best.get(cursor)
      if (!visit?.via) break
      // `via.from` liegt näher am Ziel; der Schritt führt also dorthin.
      const nextNode = visit.via.from
      if (nextNode.startsWith('c:')) {
        steps.push({
          contactId: nextNode.slice(2),
          reason: visit.via.reason,
          label: invertLabel(visit.via.reason, visit.via.label),
          inferred: INFERRED[visit.via.reason],
        })
      }
      cursor = nextNode
    }
    if (steps.length === 0) continue
    paths.push({
      startUserId: node.slice(2),
      steps,
      cost,
      hasInferred: steps.some((s) => s.inferred),
    })
    if (paths.length >= maxPaths) break
  }
  return paths
}

/**
 * Die Suche läuft vom Ziel aus, gelesen wird der Weg aber vorwärts. „wird
 * betreut von" muss deshalb als „betreut" erscheinen; symmetrische
 * Bezeichnungen bleiben, wie sie sind.
 */
function invertLabel(reason: IntroReason, label: string): string {
  if (reason === 'manages') return 'betreut'
  if (reason === 'same_team') return 'gleiches Team'
  const inverses: Record<string, string> = {
    'berichtet an': 'führt',
    führt: 'berichtet an',
    beeinflusst: 'wird beeinflusst von',
    'wird beeinflusst von': 'beeinflusst',
  }
  return inverses[label] ?? label
}
