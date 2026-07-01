import type { Contact } from './types'
import type { NewContact } from '@/data/repository'

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

/**
 * Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes
 * ("") inside quotes, commas/newlines inside quoted fields, and both \n and
 * \r\n line endings. No external dependency needed for this scope.
 */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/\r\n/g, '\n')

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      pushField()
    } else if (ch === '\n') {
      pushRow()
    } else {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) pushRow()

  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ''))
  const [headers, ...dataRows] = nonEmpty
  return { headers: headers ?? [], rows: dataRows }
}

const IMPORTABLE_FIELD_KEYS = [
  'fullName',
  'position',
  'email',
  'birthday',
  'location',
  'familyStatus',
  'children',
  'pets',
  'team',
  'activeDevices',
  'freeText',
] as const

export type ImportableField = (typeof IMPORTABLE_FIELD_KEYS)[number]
export type FieldMapping = Partial<Record<ImportableField, string>>

export interface ImportableFieldDef {
  key: ImportableField
  label: string
  required?: boolean
}

/** Importable Contact fields, with German labels for the mapping UI. */
export const IMPORTABLE_FIELDS: ImportableFieldDef[] = [
  { key: 'fullName', label: 'Name', required: true },
  { key: 'position', label: 'Funktion' },
  { key: 'email', label: 'E-Mail' },
  { key: 'birthday', label: 'Geburtstag' },
  { key: 'location', label: 'Wohnort' },
  { key: 'familyStatus', label: 'Familienstand' },
  { key: 'children', label: 'Kinder' },
  { key: 'pets', label: 'Haustiere' },
  { key: 'team', label: 'Team' },
  { key: 'activeDevices', label: 'Active Devices' },
  { key: 'freeText', label: 'Notiz' },
]

const HEADER_ALIASES: Record<ImportableField, string[]> = {
  fullName: ['name', 'vollständiger name', 'fullname', 'kontakt'],
  position: ['position', 'funktion', 'rolle', 'title'],
  email: ['email', 'e-mail', 'mail'],
  birthday: ['geburtstag', 'birthday', 'geburtsdatum'],
  location: ['wohnort', 'location', 'stadt', 'ort'],
  familyStatus: ['familienstand', 'family status'],
  children: ['kinder', 'children'],
  pets: ['haustiere', 'pets'],
  team: ['team'],
  activeDevices: ['active devices', 'geräte', 'devices'],
  freeText: ['notiz', 'notes', 'freitext'],
}

/** Best-effort header -> field mapping by normalized name matching. */
export function guessMapping(headers: string[]): FieldMapping {
  const mapping: FieldMapping = {}
  for (const header of headers) {
    const norm = header.trim().toLowerCase()
    for (const field of IMPORTABLE_FIELDS) {
      if (mapping[field.key]) continue
      if (HEADER_ALIASES[field.key].includes(norm)) {
        mapping[field.key] = header
        break
      }
    }
  }
  return mapping
}

/** Accepts YYYY-MM-DD or DD.MM.YYYY; returns YYYY-MM-DD, or undefined if unparseable. */
export function normalizeDate(value: string): string | undefined {
  const v = value.trim()
  if (!v) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (m) {
    const [, d, mo, y] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return undefined
}

export interface ImportRowResult {
  rowIndex: number
  contact: NewContact
}

export interface ImportBuildResult {
  results: ImportRowResult[]
  errors: { rowIndex: number; reason: string }[]
}

/** Turns mapped CSV rows into NewContact payloads, applying the shared region/RM. */
export function buildContactsFromRows(
  headers: string[],
  rows: string[][],
  mapping: FieldMapping,
  common: { regionId: string; relationshipManagerId: string },
): ImportBuildResult {
  const colIndex = (header: string | undefined) =>
    header === undefined ? -1 : headers.indexOf(header)

  const results: ImportRowResult[] = []
  const errors: ImportBuildResult['errors'] = []

  rows.forEach((row, rowIndex) => {
    const get = (field: ImportableField): string => {
      const idx = colIndex(mapping[field])
      return idx >= 0 ? (row[idx] ?? '').trim() : ''
    }

    const fullName = get('fullName')
    if (!fullName) {
      errors.push({ rowIndex, reason: 'Name fehlt' })
      return
    }

    results.push({
      rowIndex,
      contact: {
        fullName,
        position: get('position'),
        regionId: common.regionId,
        relationshipManagerId: common.relationshipManagerId,
        team: get('team') || undefined,
        email: get('email') || undefined,
        birthday: normalizeDate(get('birthday')),
        location: get('location') || undefined,
        familyStatus: get('familyStatus') || undefined,
        children: get('children') || undefined,
        pets: get('pets') || undefined,
        activeDevices: get('activeDevices') || undefined,
        freeText: get('freeText') || undefined,
      },
    })
  })

  return { results, errors }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Row indices (into `imported`) that look like duplicates of an existing
 * contact: same normalized name, or same email when both are present.
 */
export function findDuplicateRowIndices(
  imported: ImportRowResult[],
  existing: Contact[],
): Set<number> {
  const existingNames = new Set(existing.map((c) => normalizeName(c.fullName)))
  const existingEmails = new Set(
    existing.map((c) => c.email?.trim().toLowerCase()).filter((e): e is string => Boolean(e)),
  )
  const duplicates = new Set<number>()
  for (const { rowIndex, contact } of imported) {
    const nameHit = existingNames.has(normalizeName(contact.fullName))
    const emailHit = Boolean(contact.email) && existingEmails.has(contact.email!.trim().toLowerCase())
    if (nameHit || emailHit) duplicates.add(rowIndex)
  }
  return duplicates
}
