import type { Contact, Region } from './types'

/**
 * Was an einem Kontakt nur scheinbar gefüllt ist.
 *
 * Zwei verschiedene Dinge stehen hier zusammen, weil sie für den Nutzer
 * dasselbe bedeuten — „hier fehlt eine Zuordnung":
 *
 *  - ein PLATZHALTER: die Region „Unbekannt" ist ein echter Datensatz, aber
 *    kein Vertriebsgebiet (Migration 0024 kennzeichnet sie).
 *  - eine LÜCKE: leerer Betreuer, leere Position, leeres Team.
 *
 * Wichtig: leer heißt in dieser Datenbank meist der leere String, nicht NULL.
 * Der Import hat 458 Positionen als "" hinterlassen — `count(position)` liefert
 * deshalb 671, obwohl nur 213 Kontakte eine Position haben.
 */
export type GapKind = 'region' | 'manager' | 'position' | 'team'

const GAP_LABEL: Record<GapKind, string> = {
  region: 'Region',
  manager: 'Betreuer',
  position: 'Position',
  team: 'Team',
}

export function gapLabel(kind: GapKind): string {
  return GAP_LABEL[kind]
}

/** Leerer String, nur Leerzeichen oder nicht gesetzt. */
export function isBlank(value?: string | null): boolean {
  return value === undefined || value === null || value.trim() === ''
}

/** Trägt die Region das Platzhalter-Kennzeichen aus der Datenbank? */
export function isPlaceholderRegion(regionId: string, regions: Region[]): boolean {
  return regions.find((r) => r.id === regionId)?.isPlaceholder === true
}

/**
 * Alle Lücken eines Kontakts, nach Wichtigkeit geordnet: ohne Region und
 * Betreuer ist der Kontakt für Bericht, Abdeckung und Vorstellungspfade
 * unbrauchbar, eine fehlende Position ist bloß unschön.
 */
export function findGaps(contact: Contact, regions: Region[]): GapKind[] {
  const gaps: GapKind[] = []
  if (isPlaceholderRegion(contact.regionId, regions)) gaps.push('region')
  if (isBlank(contact.relationshipManagerId)) gaps.push('manager')
  if (isBlank(contact.position)) gaps.push('position')
  if (isBlank(contact.team)) gaps.push('team')
  return gaps
}

/**
 * Kriterium für den Filter „nur unzugeordnete": fehlende Position oder fehlendes
 * Team zählen hier NICHT mit, sonst wären zwei Drittel des Bestands
 * „unzugeordnet" und der Filter für die Massenzuordnung nutzlos.
 */
export function isUnassigned(contact: Contact, regions: Region[]): boolean {
  return isPlaceholderRegion(contact.regionId, regions) || isBlank(contact.relationshipManagerId)
}

/** Kurztext für die Kennzeichnung, z. B. „Region und Betreuer fehlen". */
export function describeGaps(gaps: GapKind[]): string {
  if (gaps.length === 0) return ''
  const names = gaps.map(gapLabel)
  if (names.length === 1) return `${names[0]} fehlt`
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]} fehlen`
}
