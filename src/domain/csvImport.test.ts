import { describe, it, expect } from 'vitest'
import {
  buildContactsFromRows,
  findDuplicateRowIndices,
  guessMapping,
  normalizeDate,
  parseCsv,
} from './csvImport'
import type { Contact } from './types'

describe('parseCsv', () => {
  it('parses a simple comma-separated file', () => {
    const { headers, rows } = parseCsv('Name,Email\nAnke Richter,anke@example.com\nThomas Berger,thomas@example.com')
    expect(headers).toEqual(['Name', 'Email'])
    expect(rows).toEqual([
      ['Anke Richter', 'anke@example.com'],
      ['Thomas Berger', 'thomas@example.com'],
    ])
  })

  it('handles quoted fields containing commas and escaped quotes', () => {
    const { rows } = parseCsv('Name,Notiz\n"Richter, Anke","Sagt \\"Hallo\\""'.replace(/\\"/g, '""'))
    expect(rows[0][0]).toBe('Richter, Anke')
    expect(rows[0][1]).toBe('Sagt "Hallo"')
  })

  it('handles CRLF line endings', () => {
    const { headers, rows } = parseCsv('Name,Email\r\nAnke,anke@example.com\r\n')
    expect(headers).toEqual(['Name', 'Email'])
    expect(rows).toEqual([['Anke', 'anke@example.com']])
  })

  it('sniffs the semicolon delimiter of German Excel exports', () => {
    const { headers, rows } = parseCsv('Name;E-Mail;Funktion\nAnke Richter;anke@example.com;Einkauf')
    expect(headers).toEqual(['Name', 'E-Mail', 'Funktion'])
    expect(rows).toEqual([['Anke Richter', 'anke@example.com', 'Einkauf']])
  })

  it('sniffs tab-separated files', () => {
    const { headers, rows } = parseCsv('Name\tE-Mail\nAnke\tanke@example.com')
    expect(headers).toEqual(['Name', 'E-Mail'])
    expect(rows).toEqual([['Anke', 'anke@example.com']])
  })

  it('keeps commas as the delimiter when semicolons only appear inside quoted fields', () => {
    const { headers, rows } = parseCsv('Name,Notiz\nAnke,"mag Segeln; Golf"')
    expect(headers).toEqual(['Name', 'Notiz'])
    expect(rows[0][1]).toBe('mag Segeln; Golf')
  })

  it('strips a UTF-8 BOM before the first header', () => {
    const { headers } = parseCsv('﻿Name;E-Mail\nAnke;a@example.com')
    expect(headers[0]).toBe('Name')
  })
})

describe('guessMapping', () => {
  it('maps common German header names to fields', () => {
    const mapping = guessMapping(['Name', 'E-Mail', 'Wohnort', 'Unbekannte Spalte'])
    expect(mapping.fullName).toBe('Name')
    expect(mapping.email).toBe('E-Mail')
    expect(mapping.location).toBe('Wohnort')
    expect(mapping.team).toBeUndefined()
  })
})

describe('normalizeDate', () => {
  it('passes through ISO dates', () => {
    expect(normalizeDate('2026-07-01')).toBe('2026-07-01')
  })
  it('converts German DD.MM.YYYY dates', () => {
    expect(normalizeDate('3.7.1979')).toBe('1979-07-03')
  })
  it('returns undefined for unparseable input', () => {
    expect(normalizeDate('not a date')).toBeUndefined()
    expect(normalizeDate('')).toBeUndefined()
  })
  it('rejects out-of-range dates instead of passing them through', () => {
    expect(normalizeDate('31.02.1990')).toBeUndefined()
    expect(normalizeDate('1990-13-05')).toBeUndefined()
    expect(normalizeDate('32.01.1990')).toBeUndefined()
    expect(normalizeDate('1990-04-31')).toBeUndefined()
  })
  it('is leap-year aware for Feb 29', () => {
    expect(normalizeDate('29.02.1992')).toBe('1992-02-29')
    expect(normalizeDate('29.02.1993')).toBeUndefined()
    expect(normalizeDate('29.02.2000')).toBe('2000-02-29') // divisible by 400
    expect(normalizeDate('29.02.1900')).toBeUndefined() // divisible by 100, not 400
  })
})

describe('buildContactsFromRows', () => {
  const headers = ['Name', 'E-Mail']
  const rows = [
    ['Anke Richter', 'anke@example.com'],
    ['', 'noname@example.com'],
  ]
  const mapping = { fullName: 'Name', email: 'E-Mail' } as const
  const common = { regionId: 'r-nord', relationshipManagerId: 'u-alex' }

  it('builds NewContact payloads for valid rows', () => {
    const { results } = buildContactsFromRows(headers, rows, mapping, common)
    expect(results).toHaveLength(1)
    expect(results[0].contact).toMatchObject({
      fullName: 'Anke Richter',
      email: 'anke@example.com',
      regionId: 'r-nord',
      relationshipManagerId: 'u-alex',
    })
  })

  it('reports an error for rows missing a required field', () => {
    const { errors } = buildContactsFromRows(headers, rows, mapping, common)
    expect(errors).toEqual([{ rowIndex: 1, reason: 'Name fehlt' }])
  })

  it('imports a row with an invalid birthday but reports a warning', () => {
    const { results, warnings } = buildContactsFromRows(
      ['Name', 'Geburtstag'],
      [['Anke Richter', '31.02.1990']],
      { fullName: 'Name', birthday: 'Geburtstag' },
      common,
    )
    expect(results).toHaveLength(1)
    expect(results[0].contact.birthday).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0].rowIndex).toBe(0)
    expect(warnings[0].reason).toContain('31.02.1990')
  })
})

describe('findDuplicateRowIndices', () => {
  const existing: Contact[] = [
    {
      id: 'c1',
      fullName: 'Anke Richter',
      position: 'p',
      regionId: 'r',
      relationshipManagerId: 'u',
      email: 'anke@example.com',
      linkedin: { status: 'unknown' },
      sentiment: 'neutral',
      wonCustomersCount: 0,
      sideFacts: [],
      customers: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]

  it('flags a case/whitespace-insensitive name match', () => {
    const { results } = buildContactsFromRows(
      ['Name'],
      [['  anke richter  '], ['Neue Person']],
      { fullName: 'Name' },
      { regionId: 'r', relationshipManagerId: 'u' },
    )
    const dupes = findDuplicateRowIndices(results, existing)
    expect(dupes.has(0)).toBe(true)
    expect(dupes.has(1)).toBe(false)
  })

  it('flags an email match even with a different name', () => {
    const { results } = buildContactsFromRows(
      ['Name', 'E-Mail'],
      [['Anke R.', 'anke@example.com']],
      { fullName: 'Name', email: 'E-Mail' },
      { regionId: 'r', relationshipManagerId: 'u' },
    )
    expect(findDuplicateRowIndices(results, existing).has(0)).toBe(true)
  })

  it('flags duplicates WITHIN the batch (same person twice in one CSV)', () => {
    const { results } = buildContactsFromRows(
      ['Name'],
      [['Neue Person'], ['neue  person'], ['Ganz Andere']],
      { fullName: 'Name' },
      { regionId: 'r', relationshipManagerId: 'u' },
    )
    const dupes = findDuplicateRowIndices(results, existing)
    expect(dupes.has(0)).toBe(false) // first occurrence is fine
    expect(dupes.has(1)).toBe(true) // second occurrence is the duplicate
    expect(dupes.has(2)).toBe(false)
  })
})
