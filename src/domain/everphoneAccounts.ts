/**
 * Abgleich zugeordneter Kunden gegen Everphone-Bestandskunden (aus Salesforce).
 *
 * Bewusst EXAKTER Abgleich auf dem normalisierten Namen, keine Fuzzy-Suche:
 * ein falsch-positives „ist schon Kunde" würde die Ansprache des Teams auf
 * eine falsche Grundlage stellen. Unschärfe fangen wir vorne über die
 * Autovervollständigung ab — wer aus der Liste wählt, trifft exakt.
 */

/** Everphone-Kundenstatus, aus Salesforce `Account.Type` abgeleitet. */
export type EverphoneStatus = 'customer' | 'inactive' | 'offboarding' | 'prospect' | 'other'

export interface EverphoneAccount {
  salesforceId: string
  name: string
  status: EverphoneStatus
  activeRentals?: number
}

export function classifyAccountType(sfType: string | null | undefined): EverphoneStatus {
  switch ((sfType ?? '').trim().toLowerCase()) {
    case 'customer':
      return 'customer'
    case 'inactive customer':
      return 'inactive'
    case 'offboarding':
      return 'offboarding'
    case 'prospect':
      return 'prospect'
    default:
      return 'other'
  }
}

export const EVERPHONE_STATUS_LABEL: Record<EverphoneStatus, string> = {
  customer: 'Everphone-Kunde',
  inactive: 'Ehem. Everphone-Kunde',
  offboarding: 'Everphone-Offboarding',
  prospect: 'Im Everphone-Funnel',
  other: 'Bei Everphone bekannt',
}

/** Badge-Varianten wie in buyingCenter.ts an die Statustokens angelehnt. */
export const EVERPHONE_STATUS_VARIANT: Record<
  EverphoneStatus,
  'success' | 'secondary' | 'warning'
> = {
  customer: 'success',
  inactive: 'secondary',
  offboarding: 'warning',
  prospect: 'secondary',
  other: 'secondary',
}

/**
 * Status, die eine Abstimmung mit dem Everphone-Account-Manager erfordern,
 * bevor der Partner den Kunden anspricht: laufende und auslaufende
 * Kundenbeziehungen. „Ehem. Kunde" und Funnel sind Kontext, keine Sperre.
 */
export function needsAmAlignment(status: EverphoneStatus): boolean {
  return status === 'customer' || status === 'offboarding'
}

/** Rechtsformen und Firmierungs-Beiwerk, die für den Abgleich entfallen. */
const LEGAL_FORMS = [
  'gmbh & co. kg',
  'gmbh & co kg',
  'ag & co. kgaa',
  'ag & co kgaa',
  'gmbh',
  'mbh',
  'kgaa',
  'kg',
  'ag',
  'se',
  'ohg',
  'gbr',
  'ug',
  'e.k.',
  'ev',
  'e.v.',
  'holding',
  'deutschland',
  'germany',
  'group',
  'gruppe',
  'inc',
  'inc.',
  'ltd',
  'ltd.',
  'llc',
  'plc',
  'bv',
  'nv',
  'sa',
  'sas',
  'srl',
  'spa',
  'oy',
  'ab',
  'as',
]

/**
 * Normalisiert einen Firmennamen für den Abgleich: Kleinschreibung, Umlaute
 * transliteriert, Interpunktion entfernt, Rechtsform-Suffixe abgeschnitten.
 *
 * „Nordmetall GmbH & Co. KG" und „nordmetall" ergeben dieselbe Signatur;
 * „Nordmetall Süd" bleibt bewusst verschieden von „Nordmetall".
 */
export function normalizeCompanyName(raw: string): string {
  let s = raw
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    // Interpunktion zu Leerzeichen, damit „Co.KG" und „Co. KG" gleich zerfallen.
    .replace(/[.,;:!?"'`´()[\]{}/\\|+*_–—-]/g, ' ')
    .replace(/&/g, ' & ')
    .replace(/\s+/g, ' ')
    .trim()

  // Rechtsformen wiederholt am Ende abschneiden („… GmbH & Co. KG" = zwei Läufe).
  let changed = true
  while (changed) {
    changed = false
    for (const form of LEGAL_FORMS) {
      const token = form.replace(/[.]/g, '').replace(/\s+/g, ' ').trim()
      if (s === token) continue // Firmenname besteht NUR daraus → nicht leeren
      if (s.endsWith(` ${token}`)) {
        s = s.slice(0, -(token.length + 1)).replace(/\s*&\s*$/, '').trim()
        changed = true
        break
      }
    }
  }
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Ordnet zugeordnete Kundennamen den Everphone-Accounts zu.
 * Rückgabe ist nach normalisiertem Namen indexiert; bei mehreren Treffern
 * gewinnt der „stärkste" Status (Kunde > Offboarding > ehemalig > Funnel).
 */
const STATUS_RANK: Record<EverphoneStatus, number> = {
  customer: 0,
  offboarding: 1,
  inactive: 2,
  prospect: 3,
  other: 4,
}

export function indexAccountsByName(accounts: EverphoneAccount[]): Map<string, EverphoneAccount> {
  const map = new Map<string, EverphoneAccount>()
  for (const account of accounts) {
    const key = normalizeCompanyName(account.name)
    if (!key) continue
    const prev = map.get(key)
    if (!prev || STATUS_RANK[account.status] < STATUS_RANK[prev.status]) {
      map.set(key, account)
    }
  }
  return map
}

/** Findet den Everphone-Account zu einem frei eingegebenen Kundennamen. */
export function matchAccount(
  customerName: string,
  index: Map<string, EverphoneAccount>,
): EverphoneAccount | undefined {
  const key = normalizeCompanyName(customerName)
  return key ? index.get(key) : undefined
}
