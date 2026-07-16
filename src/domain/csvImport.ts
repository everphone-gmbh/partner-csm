import type { Contact, Region } from './types'
import type { NewContact } from '@/data/repository'

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

/**
 * Sniffs the field delimiter from the header line: German Excel exports "CSV"
 * with semicolons (locale list separator), some tools use tabs. Counts
 * candidates outside quoted sections and picks the most frequent (comma wins
 * ties, as the least surprising default).
 */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'))
  const counts: Record<',' | ';' | '\t', number> = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) counts[ch]++
  }
  if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) return ';'
  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t'
  return ','
}

/**
 * Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes
 * ("") inside quotes, delimiters/newlines inside quoted fields, both \n and
 * \r\n line endings, a UTF-8 BOM, and auto-detects the delimiter
 * (, ; or tab — German Excel exports use ;). No external dependency needed.
 */
export function parseCsv(text: string, delimiter?: ',' | ';' | '\t'): ParsedCsv {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const sep = delimiter ?? detectDelimiter(src)

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
    } else if (ch === sep) {
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
  'company',
  'email',
  'region',
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
  { key: 'company', label: 'Firma' },
  { key: 'email', label: 'E-Mail' },
  { key: 'region', label: 'Region' },
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
  company: ['firma', 'company', 'unternehmen', 'arbeitgeber', 'organisation'],
  email: ['email', 'e-mail', 'mail'],
  region: ['region', 'gebiet', 'vertriebsregion'],
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

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

function isValidYmd(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1) return false
  const daysInMonth = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return d <= daysInMonth[mo - 1]
}

/**
 * Accepts YYYY-MM-DD or DD.MM.YYYY; returns YYYY-MM-DD, or undefined if
 * unparseable OR out of range (31.02. would otherwise slip through here and
 * blow up only on the Postgres date column, mid-import).
 */
export function normalizeDate(value: string): string | undefined {
  const v = value.trim()
  if (!v) return undefined
  let y: number, mo: number, d: number
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const german = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (iso) {
    ;[y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  } else if (german) {
    ;[d, mo, y] = [Number(german[1]), Number(german[2]), Number(german[3])]
  } else {
    return undefined
  }
  if (!isValidYmd(y, mo, d)) return undefined
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export interface ImportRowResult {
  rowIndex: number
  contact: NewContact
}

export interface ImportBuildResult {
  results: ImportRowResult[]
  errors: { rowIndex: number; reason: string }[]
  /** Row imported, but with a caveat (e.g. an invalid date that was dropped). */
  warnings: { rowIndex: number; reason: string }[]
}

/**
 * Turns mapped CSV rows into NewContact payloads. Region comes from the row's
 * Region column when mapped and resolvable (name match against `regions`,
 * case-insensitive); otherwise the shared batch region applies. The shared
 * RM applies to every row.
 */
export function buildContactsFromRows(
  headers: string[],
  rows: string[][],
  mapping: FieldMapping,
  common: { regionId: string; relationshipManagerId: string },
  regions: Region[] = [],
): ImportBuildResult {
  const colIndex = (header: string | undefined) =>
    header === undefined ? -1 : headers.indexOf(header)
  const regionIdByName = new Map(regions.map((r) => [r.name.trim().toLowerCase(), r.id]))

  const results: ImportRowResult[] = []
  const errors: ImportBuildResult['errors'] = []
  const warnings: ImportBuildResult['warnings'] = []

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

    const rawBirthday = get('birthday')
    const birthday = normalizeDate(rawBirthday)
    if (rawBirthday && !birthday) {
      warnings.push({
        rowIndex,
        reason: `Ungültiges Datum „${rawBirthday}“ — Geburtstag wird nicht importiert`,
      })
    }

    const rawRegion = get('region')
    let regionId = common.regionId
    if (rawRegion) {
      const resolved = regionIdByName.get(rawRegion.toLowerCase())
      if (resolved) {
        regionId = resolved
      } else {
        warnings.push({
          rowIndex,
          reason: `Unbekannte Region „${rawRegion}“ — Standard-Region wird verwendet`,
        })
      }
    }

    results.push({
      rowIndex,
      contact: {
        fullName,
        position: get('position'),
        company: get('company') || undefined,
        regionId,
        relationshipManagerId: common.relationshipManagerId,
        team: get('team') || undefined,
        email: get('email') || undefined,
        birthday,
        location: get('location') || undefined,
        familyStatus: get('familyStatus') || undefined,
        children: get('children') || undefined,
        pets: get('pets') || undefined,
        activeDevices: get('activeDevices') || undefined,
        freeText: get('freeText') || undefined,
      },
    })
  })

  return { results, errors, warnings }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Row indices (into `imported`) that look like duplicates: same normalized
 * name, or same email when both are present — against existing contacts AND
 * against earlier rows of the same batch (a CSV containing the same person
 * twice flags the second occurrence).
 */
export function findDuplicateRowIndices(
  imported: ImportRowResult[],
  existing: Contact[],
): Set<number> {
  const seenNames = new Set(existing.map((c) => normalizeName(c.fullName)))
  const seenEmails = new Set(
    existing.map((c) => c.email?.trim().toLowerCase()).filter((e): e is string => Boolean(e)),
  )
  const duplicates = new Set<number>()
  for (const { rowIndex, contact } of imported) {
    const name = normalizeName(contact.fullName)
    const email = contact.email?.trim().toLowerCase()
    if (seenNames.has(name) || (email !== undefined && seenEmails.has(email))) {
      duplicates.add(rowIndex)
    }
    seenNames.add(name)
    if (email !== undefined) seenEmails.add(email)
  }
  return duplicates
}
