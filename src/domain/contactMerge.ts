import type { Contact } from './types'
import type { ContactPatch } from '@/data/repository'

/**
 * Welche Felder beim Zusammenführen zur Wahl stehen, und wie aus der Wahl der
 * Patch für den Gewinner wird. Beziehungen (Anknüpfungspunkte, Kunden, Fotos,
 * Gebiete …) stehen hier NICHT: die werden vereint, nicht gewählt.
 */
export type MergeField =
  | 'fullName'
  | 'position'
  | 'company'
  | 'team'
  | 'email'
  | 'phoneWork'
  | 'phoneMobile'
  | 'phoneDirect'
  | 'phonePrivate'
  | 'emailPrivate'
  | 'businessAddress'
  | 'assistantName'
  | 'assistantContact'
  | 'birthday'
  | 'location'
  | 'familyStatus'
  | 'children'
  | 'pets'
  | 'relationshipManagerId'
  | 'sentiment'
  | 'cadenceDays'
  | 'buyingRole'
  | 'activeDevices'
  | 'wonCustomersCount'
  | 'freeText'
  | 'photoUrl'

export const MERGE_FIELDS: { key: MergeField; label: string }[] = [
  { key: 'fullName', label: 'Name' },
  { key: 'position', label: 'Funktion' },
  { key: 'company', label: 'Firma' },
  { key: 'team', label: 'Team' },
  { key: 'email', label: 'E-Mail' },
  { key: 'phoneWork', label: 'Telefon (dienstlich)' },
  { key: 'phoneMobile', label: 'Mobil (dienstlich)' },
  { key: 'phoneDirect', label: 'Durchwahl' },
  { key: 'phonePrivate', label: 'Telefon (privat)' },
  { key: 'emailPrivate', label: 'E-Mail (privat)' },
  { key: 'businessAddress', label: 'Dienstanschrift' },
  { key: 'assistantName', label: 'Assistenz' },
  { key: 'assistantContact', label: 'Assistenz (Kontakt)' },
  { key: 'birthday', label: 'Geburtstag' },
  { key: 'location', label: 'Wohnort' },
  { key: 'familyStatus', label: 'Familienstand' },
  { key: 'children', label: 'Kinder' },
  { key: 'pets', label: 'Haustiere' },
  { key: 'relationshipManagerId', label: 'Betreuer' },
  { key: 'sentiment', label: 'Beziehung' },
  { key: 'cadenceDays', label: 'Kontakt-Rhythmus' },
  { key: 'buyingRole', label: 'Rolle im Buying Center' },
  { key: 'activeDevices', label: 'Aktive Geräte' },
  { key: 'wonCustomersCount', label: 'Gewonnene Kunden' },
  { key: 'freeText', label: 'Notiz' },
  { key: 'photoUrl', label: 'Foto' },
]

/** „Leer" im Sinne des Zusammenführens: nichts, was man verlieren könnte. */
export function isEmptyValue(field: MergeField, v: unknown): boolean {
  if (v === undefined || v === null) return true
  // Sonderfälle zuerst: „neutral" ist ein Text und fiele sonst durch die
  // allgemeine Textprüfung als Wert durch.
  if (field === 'sentiment') return v === 'neutral'
  if (field === 'wonCustomersCount') return v === 0
  if (typeof v === 'string') return v.trim() === ''
  return false
}

export type MergeChoice = 'winner' | 'loser'

export interface MergeRow {
  key: MergeField
  label: string
  winner: unknown
  loser: unknown
  /** Beide gefüllt und verschieden — hier muss gewählt werden. */
  conflict: boolean
  /** Nur der Verlierer hat einen Wert — er wird übernommen. */
  takesLoser: boolean
}

/** Die Felder, die sich unterscheiden. Gleiches oder beidseitig Leeres fällt weg. */
export function mergeRows(winner: Contact, loser: Contact): MergeRow[] {
  const rows: MergeRow[] = []
  for (const { key, label } of MERGE_FIELDS) {
    const a = winner[key]
    const b = loser[key]
    const aEmpty = isEmptyValue(key, a)
    const bEmpty = isEmptyValue(key, b)
    // Hat der Verlierer nichts (oder dasselbe), behält der Gewinner seinen Wert —
    // da gibt es nichts zu entscheiden und nichts zu zeigen.
    if (bEmpty || a === b) continue
    rows.push({ key, label, winner: a, loser: b, conflict: !aEmpty && !bEmpty, takesLoser: aEmpty && !bEmpty })
  }
  return rows
}

/**
 * Der Patch für den Gewinner: bei Konflikten die Wahl, ansonsten füllt der
 * Verlierer die Lücken des Gewinners. Nur was sich am Gewinner ändert.
 */
export function mergePatch(
  rows: MergeRow[],
  choices: Partial<Record<MergeField, MergeChoice>>,
): ContactPatch {
  const patch: Record<string, unknown> = {}
  for (const r of rows) {
    const useLoser = r.conflict ? choices[r.key] === 'loser' : r.takesLoser
    if (useLoser) patch[r.key] = r.loser
  }
  return patch as ContactPatch
}
