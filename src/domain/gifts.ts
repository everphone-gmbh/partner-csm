import {
  GIFT_STATUSES,
  type GiftOccasion,
  type GiftRecipient,
  type GiftSender,
  type GiftShipping,
  type GiftStatus,
} from './types'

export const GIFT_STATUS_LABEL: Record<GiftStatus, string> = {
  geplant: 'Geplant',
  bestellt: 'Bestellt',
  versandt: 'Versandt',
  zugestellt: 'Zugestellt',
}

export const GIFT_SHIPPING_LABEL: Record<GiftShipping, string> = {
  direkt: 'Direkt',
  via_ep: 'Via EP',
}

/** Anzeigename eines Empfängers: „Vorname Nachname", sonst was da ist. */
export function recipientName(r: Pick<GiftRecipient, 'firstName' | 'lastName'>): string {
  return [r.firstName, r.lastName].map((s) => s?.trim()).filter(Boolean).join(' ') || 'Ohne Namen'
}

/**
 * Fehlt etwas, damit das Geschenk ankommt? Gilt nur für Direktversand —
 * „Via EP" läuft über den Everphone-Ansprechpartner, eine Adresse braucht es
 * dann nicht in der Liste.
 */
export function isAddressMissing(
  r: Pick<GiftRecipient, 'street' | 'postalCode' | 'city' | 'shipping'>,
): boolean {
  if (r.shipping === 'via_ep') return false
  return !r.street?.trim() || !r.postalCode?.trim() || !r.city?.trim()
}

/**
 * Der Trichter der Anlasskarte. Kumulativ, wie im Mockup: „Bestellt" zählt alles,
 * was mindestens bestellt ist — auch schon Versandtes. So liest sich jede Stufe
 * als „so viele sind bis hierher gekommen", und der Balken schrumpft nach rechts.
 */
export function giftFunnel(recipients: Pick<GiftRecipient, 'status'>[]): Record<GiftStatus, number> {
  const rank = (s: GiftStatus) => GIFT_STATUSES.indexOf(s)
  const out = { geplant: 0, bestellt: 0, versandt: 0, zugestellt: 0 } as Record<GiftStatus, number>
  for (const r of recipients) {
    for (const s of GIFT_STATUSES) if (rank(r.status) >= rank(s)) out[s]++
  }
  return out
}

/** Wie viele verschiedene Firmen — Schreibweisen ohne Groß/Klein und Leerzeichen. */
export function distinctCompanies(recipients: Pick<GiftRecipient, 'company'>[]): number {
  return new Set(
    recipients.map((r) => r.company?.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean),
  ).size
}

/** Nach Firma, dann Nachname — so stand es im Mockup („nach Firma sortiert"). */
export function sortRecipients<T extends Pick<GiftRecipient, 'company' | 'lastName' | 'firstName'>>(
  recipients: T[],
): T[] {
  const key = (s?: string) => (s ?? '').trim().toLocaleLowerCase('de')
  return [...recipients].sort(
    (a, b) =>
      key(a.company).localeCompare(key(b.company), 'de') ||
      key(a.lastName).localeCompare(key(b.lastName), 'de') ||
      key(a.firstName).localeCompare(key(b.firstName), 'de'),
  )
}

export interface RecipientFilter {
  productId?: string
  senderId?: string
  status?: GiftStatus
  query?: string
}

export function filterRecipients<T extends GiftRecipient>(recipients: T[], f: RecipientFilter): T[] {
  const q = f.query?.trim().toLowerCase()
  return recipients.filter(
    (r) =>
      (!f.productId || r.productId === f.productId) &&
      (!f.senderId || r.senderIds.includes(f.senderId)) &&
      (!f.status || r.status === f.status) &&
      (!q ||
        [r.firstName, r.lastName, r.company, r.city]
          .filter(Boolean)
          .some((s) => s!.toLowerCase().includes(q))),
  )
}

/** C-Level zuerst, dann alphabetisch — so stehen die Voreinstellungen vorn. */
export function sortSenders(senders: GiftSender[]): GiftSender[] {
  return [...senders].sort(
    (a, b) => Number(b.isCLevel) - Number(a.isCLevel) || a.name.localeCompare(b.name, 'de'),
  )
}

/** Die Absender, mit denen eine neue Zeile startet: alle C-Level. */
export function defaultSenderIds(senders: GiftSender[]): string[] {
  return senders.filter((s) => s.isCLevel).map((s) => s.id)
}

/**
 * Reihenfolge der Reiter: Weihnachten und Sonstiges nach Anlage, neueste zuerst;
 * der laufende Geburtstags-Anlass immer zuletzt.
 */
export function sortOccasions(occasions: GiftOccasion[]): GiftOccasion[] {
  return [...occasions].sort((a, b) => {
    if (a.kind === 'geburtstag' && b.kind !== 'geburtstag') return 1
    if (b.kind === 'geburtstag' && a.kind !== 'geburtstag') return -1
    return b.name.localeCompare(a.name, 'de', { numeric: true })
  })
}
