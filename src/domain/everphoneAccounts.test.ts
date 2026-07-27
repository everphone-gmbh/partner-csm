import { describe, expect, it } from 'vitest'
import {
  classifyAccountType,
  indexAccountsByName,
  matchAccount,
  needsAmAlignment,
  normalizeCompanyName,
  type EverphoneAccount,
} from './everphoneAccounts'

describe('normalizeCompanyName', () => {
  it('schneidet gängige Rechtsformen ab', () => {
    expect(normalizeCompanyName('Nordmetall GmbH')).toBe('nordmetall')
    expect(normalizeCompanyName('Nordmetall AG')).toBe('nordmetall')
    expect(normalizeCompanyName('Nordmetall SE')).toBe('nordmetall')
    expect(normalizeCompanyName('Nordmetall GmbH & Co. KG')).toBe('nordmetall')
    expect(normalizeCompanyName('Nordmetall AG & Co. KGaA')).toBe('nordmetall')
  })

  it('macht Schreibweisen mit Umlauten und Interpunktion vergleichbar', () => {
    expect(normalizeCompanyName('Müller & Söhne GmbH')).toBe('mueller & soehne')
    expect(normalizeCompanyName('MUELLER & SOEHNE')).toBe('mueller & soehne')
    expect(normalizeCompanyName('Groß-Handel KG')).toBe('gross handel')
  })

  it('erkennt dieselbe Firma in unterschiedlicher Schreibweise', () => {
    const variants = [
      'Hanse Logistik GmbH',
      'hanse logistik gmbh',
      'Hanse Logistik  GmbH ',
      'Hanse-Logistik GmbH',
    ]
    const normalized = new Set(variants.map(normalizeCompanyName))
    expect(normalized.size).toBe(1)
    expect([...normalized][0]).toBe('hanse logistik')
  })

  it('hält verschiedene Firmen auseinander', () => {
    expect(normalizeCompanyName('Nordmetall GmbH')).not.toBe(normalizeCompanyName('Nordmetall Süd GmbH'))
    expect(normalizeCompanyName('Meyer AG')).not.toBe(normalizeCompanyName('Meyers AG'))
  })

  it('leert einen Namen nicht, der nur aus einer Rechtsform besteht', () => {
    expect(normalizeCompanyName('GmbH')).toBe('gmbh')
    expect(normalizeCompanyName('AG')).toBe('ag')
  })

  it('kommt mit leerem und reinem Interpunktions-Input zurecht', () => {
    expect(normalizeCompanyName('')).toBe('')
    expect(normalizeCompanyName('   ')).toBe('')
    expect(normalizeCompanyName('--- ...')).toBe('')
  })
})

describe('classifyAccountType', () => {
  it('bildet die Salesforce-Typen ab', () => {
    expect(classifyAccountType('Customer')).toBe('customer')
    expect(classifyAccountType('Inactive Customer')).toBe('inactive')
    expect(classifyAccountType('Offboarding')).toBe('offboarding')
    expect(classifyAccountType('Prospect')).toBe('prospect')
    expect(classifyAccountType('Partner')).toBe('other')
    expect(classifyAccountType(null)).toBe('other')
    expect(classifyAccountType('  customer ')).toBe('customer')
  })
})

describe('needsAmAlignment', () => {
  it('verlangt Abstimmung nur bei laufender oder auslaufender Kundenbeziehung', () => {
    expect(needsAmAlignment('customer')).toBe(true)
    expect(needsAmAlignment('offboarding')).toBe(true)
    expect(needsAmAlignment('inactive')).toBe(false)
    expect(needsAmAlignment('prospect')).toBe(false)
    expect(needsAmAlignment('other')).toBe(false)
  })
})

describe('indexAccountsByName / matchAccount', () => {
  const accounts: EverphoneAccount[] = [
    { salesforceId: '001a', name: 'Nordmetall GmbH', status: 'customer', activeRentals: 120 },
    { salesforceId: '001b', name: 'Hanse Logistik AG', status: 'prospect' },
    { salesforceId: '001c', name: 'Alpen Maschinenbau GmbH', status: 'offboarding' },
  ]
  const index = indexAccountsByName(accounts)

  it('trifft über Rechtsform- und Schreibweisen-Unterschiede hinweg', () => {
    expect(matchAccount('Nordmetall', index)?.status).toBe('customer')
    expect(matchAccount('nordmetall gmbh', index)?.activeRentals).toBe(120)
    expect(matchAccount('Alpen-Maschinenbau GmbH', index)?.status).toBe('offboarding')
  })

  it('liefert bei unbekannten Firmen kein Ergebnis (keine Fuzzy-Treffer)', () => {
    expect(matchAccount('Nordmetall Süd', index)).toBeUndefined()
    expect(matchAccount('Völlig Andere GmbH', index)).toBeUndefined()
    expect(matchAccount('', index)).toBeUndefined()
  })

  it('nimmt bei Namensdubletten den stärksten Status', () => {
    const withDupe = indexAccountsByName([
      { salesforceId: '1', name: 'Doppel GmbH', status: 'prospect' },
      { salesforceId: '2', name: 'Doppel AG', status: 'customer' },
      { salesforceId: '3', name: 'Doppel SE', status: 'inactive' },
    ])
    expect(matchAccount('Doppel', withDupe)?.status).toBe('customer')
    expect(matchAccount('Doppel', withDupe)?.salesforceId).toBe('2')
  })
})
