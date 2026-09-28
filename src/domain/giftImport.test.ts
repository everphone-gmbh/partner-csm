import { describe, expect, it } from 'vitest'
import {
  blockToDrafts,
  collectSenderTokens,
  guessMapping,
  mapHeaderCell,
  matchContact,
  parseShipping,
  splitIntoBlocks,
  splitSenderTokens,
} from './giftImport'
import { detectDelimiter, parseCsv } from './csvImport'

/**
 * Nachbau des Sheets „X-Mas Gifts 2026/27" in seiner STRUKTUR: drei Listen
 * untereinander, drei Spaltenaufbauten, die dritte ohne Kopfzeile, Fußzeilen
 * dazwischen, eine Leerzeile mitten in Liste A. Alle Personennamen sind
 * erfunden — echte Daten gehören nicht ins Repository.
 */
const SHEET = [
  ['Vorname', 'Nachname', 'All', 'Street', 'PLZ', 'City', 'Country Code', 'EP Ansprechpartner', 'Geschenk'],
  ['Mara', 'Feldberg', 'Nordlicht AG', 'Hafenstraße 12', '20457', 'Hamburg', 'DE', 'Jonas / Moritz', 'Geschenkbox'],
  ['Tilo', 'Brenner', 'Brenner & Söhne GmbH', 'Am Markt 3', '80331', 'München', 'DE', 'Mira', 'Geschenkbox'],
  ['', '', '', '', '', '', '', '', ''],
  ['Ida', 'Sommer', 'Sommer Logistik', 'Ringweg 7', '1010', 'Wien', 'AT', 'Jonas', 'Geschenkbox'],
  ['232 Boxen', '', '', '', '', '', '', '', ''],
  ['in 2025/26', '', '', '', '', '', '', '', ''],
  ['Sender', 'Account', 'Vorname', 'Nachname', 'Adresse', 'PLZ', 'Stadt', 'Land', 'Owner / Co', 'Produkt'],
  ['Direkt', 'Kaiser Werke', 'Nele', 'Kaiser', 'Werkstraße 1', '44135', 'Dortmund', 'DE', 'Mira, Sina', 'Berliner Brandstifter'],
  ['Via EP', 'Lindenhof KG', 'Paul', 'Linde', 'Allee 44', '50667', 'Köln', 'DE', 'Jonas & Gregor', 'Berliner Brandstifter'],
  ['55 Gin in 2026/27', '', '', '', '', '', '', '', '', ''],
  ['Weber Consulting', 'Anna', 'Weber', 'Parkweg 2', '60311', 'Frankfurt', 'DE', 'Jonas / Emil', 'Schokolade'],
  ['Hofmann IT', 'Ben', 'Hofmann', 'Lindenstraße 9', '70173', 'Stuttgart', 'DE', 'Jonas', 'Schokolade'],
  ['Gruber GmbH', 'Clara', 'Gruber', 'Seestraße 5', '8001', 'Zürich', 'CH', 'Jonas und Nora', 'Schokolade'],
  ['171 x Schoki in 2026/27', '', '', '', '', '', '', '', ''],
]

describe('splitIntoBlocks — die drei Listen des Sheets', () => {
  const blocks = splitIntoBlocks(SHEET)

  it('findet genau drei Listen', () => {
    expect(blocks).toHaveLength(3)
    expect(blocks.map((b) => b.rows.length)).toEqual([3, 2, 3])
  })

  it('schneidet Liste A an der Leerzeile NICHT auseinander', () => {
    expect(blocks[0].rows.map((r) => r[1])).toEqual(['Feldberg', 'Brenner', 'Sommer'])
  })

  it('übernimmt die Fußzeilen als Hinweis zum Benennen', () => {
    expect(blocks[0].footer).toBe('232 Boxen · in 2025/26')
    expect(blocks[1].footer).toBe('55 Gin in 2026/27')
    expect(blocks[2].footer).toBe('171 x Schoki in 2026/27')
  })

  it('liest Liste A über ihre Kopfzeile — „All" ist die Firma', () => {
    expect(blocks[0].mappingSource).toBe('header')
    expect(blocks[0].mapping).toEqual([
      'firstName', 'lastName', 'company', 'street', 'postalCode', 'city', 'country', 'senders', 'product',
    ])
  })

  it('liest in Liste B „Sender" als Versandweg, nicht als Person', () => {
    expect(blocks[1].mapping[0]).toBe('shipping')
    expect(blocks[1].mapping[8]).toBe('senders')
  })

  it('errät für Liste C ohne Kopfzeile den Aufbau aus dem Inhalt', () => {
    expect(blocks[2].mappingSource).toBe('guessed')
    expect(blocks[2].mapping).toEqual([
      'company', 'firstName', 'lastName', 'street', 'postalCode', 'city', 'country', 'senders', 'product',
    ])
  })
})

describe('blockToDrafts', () => {
  const blocks = splitIntoBlocks(SHEET)

  it('übersetzt Zeilen in Entwürfe mit getrennten Absendern', () => {
    const { drafts } = blockToDrafts(blocks[0])
    expect(drafts[0]).toMatchObject({
      firstName: 'Mara',
      lastName: 'Feldberg',
      company: 'Nordlicht AG',
      postalCode: '20457',
      productName: 'Geschenkbox',
      senderTokens: ['Jonas', 'Moritz'],
    })
  })

  it('liest den Versandweg aus Liste B', () => {
    const { drafts } = blockToDrafts(blocks[1])
    expect(drafts.map((d) => d.shipping)).toEqual(['direkt', 'via_ep'])
  })

  it('überspringt Zeilen ohne Person und ohne Firma', () => {
    const { drafts, skipped } = blockToDrafts({
      rows: [['', '', '', 'Nur eine Straße 1']],
      mapping: ['firstName', 'lastName', 'company', 'street'],
    })
    expect(drafts).toHaveLength(0)
    expect(skipped).toBe(1)
  })
})

describe('Absender', () => {
  it.each([
    ['Jonas / Moritz', ['Jonas', 'Moritz']],
    ['Mira, Sina & Gregor', ['Mira', 'Sina', 'Gregor']],
    ['Jonas und Emil', ['Jonas', 'Emil']],
    ['  Jonas   Peter  ', ['Jonas Peter']],
    ['Owner / Co', ['Owner']],
    ['-', []],
  ])('zerlegt %j', (raw, tokens) => {
    expect(splitSenderTokens(raw)).toEqual(tokens)
  })

  it('zählt Schreibweisen über alle Listen, häufigste zuerst, ohne Groß/Klein-Dubletten', () => {
    const counts = collectSenderTokens([
      { senderTokens: ['Jonas', 'Moritz'] },
      { senderTokens: ['jonas'] },
      { senderTokens: ['Mira'] },
    ])
    expect(counts[0]).toEqual({ token: 'Jonas', count: 2 })
    expect(counts).toHaveLength(3)
  })
})

describe('Einzelteile', () => {
  it.each([
    ['EP Ansprechpartner', 'senders'],
    ['Owner / Co', 'senders'],
    ['Country Code', 'country'],
    ['Straße', 'street'],
    ['Sender', 'shipping'],
    ['Geschenk', 'product'],
    ['Lieblingsfarbe', undefined],
  ])('Kopfzelle %j → %j', (cell, field) => {
    expect(mapHeaderCell(cell)).toBe(field)
  })

  it.each([
    ['Direkt', 'direkt'],
    ['Via EP', 'via_ep'],
    ['via everphone', 'via_ep'],
    ['irgendwas', undefined],
  ])('Versandweg %j → %j', (raw, v) => {
    expect(parseShipping(raw)).toBe(v)
  })

  it('verknüpft nur bei genau einem gleichnamigen Kontakt', () => {
    const contacts = [
      { id: 'c1', fullName: 'Mara Feldberg' },
      { id: 'c2', fullName: 'Tilo Brenner' },
      { id: 'c3', fullName: 'Tilo Brenner' },
    ]
    expect(matchContact({ firstName: 'mara', lastName: 'FELDBERG' }, contacts)).toBe('c1')
    expect(matchContact({ firstName: 'Tilo', lastName: 'Brenner' }, contacts)).toBeUndefined()
    expect(matchContact({ lastName: 'Feldberg' }, contacts)).toBeUndefined()
  })


  it('errät ohne Kopf auch eine Liste, in der die Absender ohne Trennzeichen stehen', () => {
    const m = guessMapping([
      ['Weber Consulting', 'Anna', 'Weber', 'Parkweg 2', '60311', 'Frankfurt', 'DE', 'Jonas', 'Schokolade'],
      ['Hofmann IT', 'Ben', 'Hofmann', 'Lindenstraße 9', '70173', 'Stuttgart', 'DE', 'Emil', 'Schokolade'],
    ])
    expect(m[7]).toBe('senders')
    expect(m[8]).toBe('product')
  })
})

describe('Ende-zu-Ende: aus Google Sheets eingefügt', () => {
  it('liest den eingefügten Text wie das Sheet', () => {
    const text = SHEET.map((r) => r.join('\t')).join('\n')
    const parsed = parseCsv(text, detectDelimiter(text))
    const table = [parsed.headers, ...parsed.rows]
    const blocks = splitIntoBlocks(table)
    expect(blocks.map((b) => b.rows.length)).toEqual([3, 2, 3])
  })
})
