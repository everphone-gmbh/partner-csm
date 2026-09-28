import type { Contact, GiftShipping } from './types'

/**
 * Einlesen der Geschenklisten aus Google Sheets.
 *
 * Vorlage ist das Sheet „X-Mas Gifts 2026/27": EIN Tabellenblatt, darin drei
 * Listen untereinander mit drei verschiedenen Spaltenaufbauten —
 *
 *   A  Vorname · Nachname · All (= Firma) · Street · PLZ · City · Country Code ·
 *      EP Ansprechpartner · Geschenk                       (2025/26, mit Kopf)
 *   B  Sender (= Versandweg!) · Account · Vorname · Nachname · Adresse · PLZ ·
 *      Stadt · Land · Owner / Co · Produkt                 (2026/27, mit Kopf)
 *   C  Firma · Vorname · Nachname · Adresse · PLZ · Stadt · Land · Owner · Produkt
 *                                                          (2026/27, OHNE Kopf)
 *
 * — getrennt durch Fußzeilen wie „232 Boxen" oder „55 Gin in 2026/27". Die
 * Absender stehen als Freitext („Jonas / Moritz", „Mira, Sina & Co"), in 45
 * Schreibweisen. Dieses Modul zerlegt das in Blöcke, schlägt je Block die
 * Spaltenbedeutung vor und liefert Entwürfe; bestätigt wird in der Oberfläche.
 *
 * Alles hier ist rein — kein Speicher, keine Oberfläche. Die Daten laufen beim
 * echten Import vom Browser direkt in die Datenbank, nie durch Dritte.
 */

export type GiftImportField =
  | 'firstName'
  | 'lastName'
  | 'company'
  | 'street'
  | 'postalCode'
  | 'city'
  | 'country'
  | 'senders'
  | 'product'
  | 'shipping'
  | 'ignore'

export const GIFT_IMPORT_FIELD_LABEL: Record<GiftImportField, string> = {
  firstName: 'Vorname',
  lastName: 'Nachname',
  company: 'Firma',
  street: 'Straße',
  postalCode: 'PLZ',
  city: 'Ort',
  country: 'Land',
  senders: 'Absender',
  product: 'Produkt',
  shipping: 'Versandweg',
  ignore: '— ignorieren —',
}

export interface ImportBlock {
  index: number
  /** Die Kopfzeile, wie sie im Sheet stand — fehlt bei Block C. */
  header?: string[]
  /** Je Spalte die Bedeutung; in der Oberfläche änderbar. */
  mapping: GiftImportField[]
  mappingSource: 'header' | 'guessed'
  rows: string[][]
  /** Text der Fußzeile direkt nach dem Block, z. B. „55 Gin in 2026/27". */
  footer?: string
}

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
}

const HEADER_WORDS: [GiftImportField, string[]][] = [
  ['firstName', ['vorname', 'first name', 'firstname', 'given name']],
  ['lastName', ['nachname', 'last name', 'lastname', 'surname', 'name']],
  ['company', ['firma', 'account', 'all', 'company', 'unternehmen', 'kunde']],
  ['street', ['street', 'strasse', 'adresse', 'address', 'anschrift']],
  ['postalCode', ['plz', 'zip', 'postleitzahl', 'postal code', 'postcode']],
  ['city', ['city', 'stadt', 'ort']],
  ['country', ['country code', 'country', 'land']],
  // „Sender" ist im Sheet NICHT die Person, sondern der Versandweg (Direkt/Via EP).
  ['shipping', ['sender', 'versand', 'versandweg', 'shipping']],
  [
    'senders',
    ['ep ansprechpartner', 'owner', 'owner/co', 'owners', 'absender', 'von', 'ansprechpartner'],
  ],
  ['product', ['geschenk', 'produkt', 'product', 'gift', 'artikel']],
]

/** Welche Bedeutung hat eine Kopfzelle? undefined = unbekannt. */
export function mapHeaderCell(cell: string): GiftImportField | undefined {
  const n = norm(cell)
  if (!n) return undefined
  for (const [field, words] of HEADER_WORDS) if (words.includes(n)) return field
  return undefined
}

function nonEmpty(row: string[]): string[] {
  return row.map((c) => c.trim()).filter(Boolean)
}

/** Eine Kopfzeile trägt mindestens drei bekannte Spaltennamen, darunter eine Person oder Firma. */
function isHeaderRow(row: string[]): boolean {
  const fields = row.map(mapHeaderCell).filter(Boolean) as GiftImportField[]
  return (
    fields.length >= 3 &&
    fields.some((f) => f === 'firstName' || f === 'lastName' || f === 'company')
  )
}

/**
 * Datenzeilen haben mindestens drei gefüllte Zellen (Name, Nachname, Firma …).
 * Kürzere Zeilen mit Text sind Fußzeilen („232 Boxen", „in 2025/26") und
 * trennen die Listen. Leere Zeilen trennen NICHT — im Sheet steht mitten in
 * Liste A eine Leerzeile, die sonst den Block zerschnitte.
 */
export function splitIntoBlocks(table: string[][]): ImportBlock[] {
  const blocks: ImportBlock[] = []
  let current: ImportBlock | undefined
  let pendingHeader: string[] | undefined

  const close = () => {
    if (current && current.rows.length > 0) blocks.push(current)
    current = undefined
  }

  for (const raw of table) {
    const row = raw.map((c) => c ?? '')
    const filled = nonEmpty(row)
    if (filled.length === 0) continue
    if (isHeaderRow(row)) {
      close()
      pendingHeader = row.map((c) => c.trim())
      continue
    }
    if (filled.length <= 2) {
      // Fußzeile: schließt den Block, ihr Text hilft beim Benennen des Anlasses.
      if (current) current.footer = [current.footer, filled.join(' ')].filter(Boolean).join(' · ')
      else if (blocks.length > 0) {
        const last = blocks[blocks.length - 1]
        last.footer = [last.footer, filled.join(' ')].filter(Boolean).join(' · ')
      }
      close()
      continue
    }
    if (!current) {
      current = {
        index: blocks.length,
        header: pendingHeader,
        mapping: [],
        mappingSource: pendingHeader ? 'header' : 'guessed',
        rows: [],
      }
      pendingHeader = undefined
    }
    current.rows.push(row.map((c) => c.trim()))
  }
  close()

  return blocks.map((b, index) => {
    const width = Math.max(b.header?.length ?? 0, ...b.rows.map((r) => r.length))
    const rows = b.rows.map((r) => [...r, ...Array(Math.max(0, width - r.length)).fill('')])
    const mapping = b.header
      ? Array.from({ length: width }, (_, j) => (b.header![j] ? mapHeaderCell(b.header![j]) : undefined) ?? 'ignore')
      : guessMapping(rows)
    return { ...b, index, rows, mapping }
  })
}

const COUNTRY_WORDS = new Set(
  [
    'de', 'deu', 'deutschland', 'germany', 'at', 'aut', 'oesterreich', 'austria', 'ch', 'che',
    'schweiz', 'switzerland', 'nl', 'niederlande', 'netherlands', 'fr', 'frankreich', 'france',
    'es', 'spanien', 'spain', 'it', 'italien', 'italy', 'uk', 'gb', 'grossbritannien', 'us',
    'usa', 'be', 'belgien', 'lu', 'luxemburg', 'dk', 'daenemark', 'pl', 'polen', 'cz', 'se',
    'schweden', 'ie', 'irland', 'pt', 'portugal',
  ],
)

const SHIPPING_WORDS = new Set(['direkt', 'via ep', 'via_ep', 'via everphone', 'ep'])

function share(values: string[], test: (v: string) => boolean): number {
  if (values.length === 0) return 0
  return values.filter(test).length / values.length
}

/**
 * Spaltenbedeutung für eine Liste OHNE Kopfzeile (Block C) aus dem Inhalt
 * erraten. Reihenfolge der Prüfungen: das Eindeutigste zuerst (PLZ, Versandweg,
 * Land, Straße), dann das Produkt (wenige verschiedene Werte, fast immer
 * gefüllt) und die Absender (Trennzeichen), der Rest von links nach rechts
 * Firma, Vorname, Nachname — so steht es in Block C. Die Spalte direkt hinter
 * der PLZ wird der Ort. Ein Vorschlag, kein Urteil: die Oberfläche zeigt ihn
 * zum Bestätigen.
 */
export function guessMapping(rows: string[][]): GiftImportField[] {
  const width = Math.max(0, ...rows.map((r) => r.length))
  const cols = Array.from({ length: width }, (_, j) =>
    rows.map((r) => (r[j] ?? '').trim()).filter(Boolean),
  )
  const filledShare = (j: number) => (rows.length ? cols[j].length / rows.length : 0)
  const mapping: GiftImportField[] = Array(width).fill('ignore')
  const taken = (j: number) => mapping[j] !== 'ignore'

  const pick = (field: GiftImportField, score: (j: number) => number, min: number) => {
    let best = -1
    let bestScore = min
    for (let j = 0; j < width; j++) {
      if (taken(j) || cols[j].length === 0) continue
      const s = score(j)
      if (s >= bestScore) {
        best = j
        bestScore = s
      }
    }
    if (best >= 0) mapping[best] = field
    return best
  }

  const postal = pick('postalCode', (j) => share(cols[j], (v) => /^(d-)?\d{4,5}$/i.test(v)), 0.7)
  pick('shipping', (j) => share(cols[j], (v) => SHIPPING_WORDS.has(norm(v))), 0.7)
  pick(
    'country',
    (j) => share(cols[j], (v) => COUNTRY_WORDS.has(norm(v)) || /^[A-Z]{2}$/.test(v)),
    0.6,
  )
  pick('street', (j) => share(cols[j], (v) => /[a-zäöüß].*\s\d/i.test(v)), 0.6)
  pick(
    'product',
    (j) => (new Set(cols[j].map(norm)).size <= 3 && filledShare(j) >= 0.8 ? filledShare(j) : 0),
    0.8,
  )
  pick('senders', (j) => share(cols[j], (v) => /[/,&+]|\bund\b/i.test(v)), 0.3)

  if (postal >= 0 && postal + 1 < width && !taken(postal + 1)) mapping[postal + 1] = 'city'

  const order: GiftImportField[] = ['company', 'firstName', 'lastName']
  for (let j = 0, k = 0; j < width && k < order.length; j++) {
    if (taken(j) || cols[j].length === 0) continue
    mapping[j] = order[k++]
  }
  // Blieb eine Spalte mit Namen übrig und fehlen noch Absender, sind es welche
  // ohne Trennzeichen („Jonas").
  if (!mapping.includes('senders')) {
    const rest = mapping.findIndex((f, j) => f === 'ignore' && cols[j].length > 0)
    if (rest >= 0) mapping[rest] = 'senders'
  }
  return mapping
}

/** „Jonas / Moritz", „Mira, Sina & Gregor", „Jonas und Emil" → einzelne Namen. */
export function splitSenderTokens(raw: string): string[] {
  return raw
    .split(/\s*(?:\/|,|&|\+|;|\bund\b|\band\b)\s*/i)
    .map((t) => t.trim().replace(/\s+/g, ' '))
    .filter((t) => t && t !== '-' && !/^co\.?$/i.test(t))
}

export function parseShipping(raw: string): GiftShipping | undefined {
  const n = norm(raw)
  if (!n) return undefined
  if (n.startsWith('via') || n === 'ep') return 'via_ep'
  if (n.startsWith('direkt') || n === 'direct') return 'direkt'
  return undefined
}

export interface DraftRecipient {
  firstName?: string
  lastName?: string
  company?: string
  street?: string
  postalCode?: string
  city?: string
  country?: string
  productName?: string
  shipping?: GiftShipping
  senderTokens: string[]
}

/** Zeilen eines Blocks in Entwürfe übersetzen; Zeilen ohne Person und Firma fallen weg. */
export function blockToDrafts(
  block: Pick<ImportBlock, 'rows' | 'mapping'>,
): { drafts: DraftRecipient[]; skipped: number } {
  const drafts: DraftRecipient[] = []
  let skipped = 0
  for (const row of block.rows) {
    const d: DraftRecipient = { senderTokens: [] }
    block.mapping.forEach((field, j) => {
      const v = (row[j] ?? '').trim()
      if (!v || field === 'ignore') return
      if (field === 'senders') d.senderTokens.push(...splitSenderTokens(v))
      else if (field === 'shipping') d.shipping = parseShipping(v) ?? d.shipping
      else if (field === 'product') d.productName = v
      else d[field] = v
    })
    if (!d.firstName && !d.lastName && !d.company) {
      skipped++
      continue
    }
    drafts.push(d)
  }
  return { drafts, skipped }
}

/** Alle Absender-Schreibweisen mit Häufigkeit, häufigste zuerst. */
export function collectSenderTokens(drafts: DraftRecipient[]): { token: string; count: number }[] {
  const counts = new Map<string, { token: string; count: number }>()
  for (const d of drafts) {
    for (const t of d.senderTokens) {
      const key = t.toLowerCase()
      const e = counts.get(key)
      if (e) e.count++
      else counts.set(key, { token: t, count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.token.localeCompare(b.token, 'de'))
}

function nameKey(s: string): string {
  return norm(s).replace(/[^a-z ]/g, '')
}

/**
 * Gleichnamiger Kontakt im Tool? Nur bei genau EINEM Treffer — zwei Kontakte
 * gleichen Namens verknüpfen wir nicht auf Verdacht.
 */
export function matchContact(
  d: Pick<DraftRecipient, 'firstName' | 'lastName'>,
  contacts: Pick<Contact, 'id' | 'fullName'>[],
): string | undefined {
  const full = [d.firstName, d.lastName].filter(Boolean).join(' ')
  if (!d.firstName || !d.lastName) return undefined
  const key = nameKey(full)
  const hits = contacts.filter((c) => nameKey(c.fullName) === key)
  return hits.length === 1 ? hits[0].id : undefined
}
