import type { Contact } from './types'

/**
 * Die Gebiete eines Kontakts — seit Migration 0035 können es mehrere sein.
 *
 * Eine Teamassistenz betreut zwei Regionen; im Tool hatte ein Kontakt bis dahin
 * genau eine (gemeldet 2026-09-24). Entscheidung Jannik 2026-09-25: beliebig
 * viele, **alle gleichwertig**.
 *
 * `regionId` bleibt daneben bestehen und benennt das führende Gebiet. Es ist
 * immer auch Mitglied von `regionIds` — die Datenbank hält das per Trigger so.
 * Die Oberfläche soll trotzdem nirgends `regionId` zum Filtern oder Zählen
 * verwenden, sonst fehlt ein zweitzugeordneter Kontakt in einer der Listen.
 * Genau dafür gibt es diese beiden Funktionen.
 */
export function contactRegionIds(contact: Pick<Contact, 'regionId' | 'regionIds'>): string[] {
  // Rückfall auf das führende Gebiet: der Demo-Modus und ältere Fixtures kennen
  // regionIds nicht, und ein leeres Array würde einen Kontakt spurlos aus jeder
  // Auswertung fallen lassen.
  const ids = contact.regionIds
  return ids && ids.length > 0 ? ids : [contact.regionId]
}

/** Gehört der Kontakt zu diesem Gebiet? */
export function isInRegion(
  contact: Pick<Contact, 'regionId' | 'regionIds'>,
  regionId: string,
): boolean {
  return contactRegionIds(contact).includes(regionId)
}
