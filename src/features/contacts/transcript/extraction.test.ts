import { describe, it, expect } from 'vitest'
import type { Contact } from '@/domain/types'
import { buildExtractionPrompt, parseSuggestions, planApply } from './extraction'

const contact: Contact = {
  id: 'c1',
  fullName: 'Anke Richter',
  position: '',
  regionId: 'r1',
  relationshipManagerId: 'u1',
  linkedin: { status: 'unknown' },
  sentiment: 'neutral',
  wonCustomersCount: 0,
  sideFacts: [{ id: 'sf1', label: 'Segeln', category: 'sport' }],
  customers: [{ id: 'cu1', name: 'ACME', withUs: true }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('buildExtractionPrompt', () => {
  it('enthält Kontaktname, Transkript, Art.-9-Ausschluss und die Zielfelder', () => {
    const p = buildExtractionPrompt('Fährt gern Ski.', 'Anke Richter')
    expect(p).toContain('Anke Richter')
    expect(p).toContain('Fährt gern Ski.')
    expect(p).toContain('Art. 9')
    expect(p).toContain('"sideFact"')
    expect(p).toContain('JSON-Array')
  })
})

describe('parseSuggestions — robuste Eingabe', () => {
  it('liest ein sauberes JSON-Array ein und vergibt stabile Ids', () => {
    const r = parseSuggestions(
      JSON.stringify([
        { target: 'sideFact', value: 'Segeln', evidence: 'segelt am Wochenende', category: 'sport' },
        { target: 'location', value: 'Hamburg', evidence: 'wohnt in Hamburg' },
      ]),
    )
    expect(r.ok).toBe(true)
    expect(r.suggestions).toHaveLength(2)
    expect(r.suggestions[0].id).toBe('sug-0')
    expect(r.suggestions[1].target).toBe('location')
  })

  it('verkraftet Markdown-Fences und vorangestellten Fließtext', () => {
    const raw = 'Hier die Fakten:\n```json\n[{"target":"pets","value":"Hund","evidence":"hat einen Hund"}]\n```'
    const r = parseSuggestions(raw)
    expect(r.ok).toBe(true)
    expect(r.suggestions).toHaveLength(1)
    expect(r.suggestions[0].value).toBe('Hund')
  })

  it('verwirft unbekannte Zielfelder und leere Werte', () => {
    const r = parseSuggestions(
      JSON.stringify([
        { target: 'unbekannt', value: 'x', evidence: 'y' },
        { target: 'location', value: '   ', evidence: 'y' },
        { target: 'pets', value: 'Katze', evidence: 'hat eine Katze' },
      ]),
    )
    expect(r.suggestions.map((s) => s.value)).toEqual(['Katze'])
  })

  it('normalisiert eine ungültige sideFact-Kategorie auf "other"', () => {
    const r = parseSuggestions(
      JSON.stringify([{ target: 'sideFact', value: 'Kochen', evidence: 'kocht gern', category: 'quatsch' }]),
    )
    expect(r.suggestions[0].category).toBe('other')
  })

  it('markiert Art.-9-Daten als blockiert statt sie stillschweigend zu behalten', () => {
    const r = parseSuggestions(
      JSON.stringify([
        { target: 'sideFact', value: 'ist evangelisch', evidence: 'geht jeden Sonntag in die Kirche' },
        { target: 'sideFact', value: 'Tennis', evidence: 'spielt Tennis' },
      ]),
    )
    const [religion, tennis] = r.suggestions
    expect(religion.blocked).toBe(true)
    expect(religion.blockReason).toContain('Religion')
    expect(tennis.blocked).toBeUndefined()
  })

  it('gibt ok:false bei ungültigem JSON, Nicht-Array oder leerer Eingabe', () => {
    expect(parseSuggestions('kaputt').ok).toBe(false)
    expect(parseSuggestions('{"target":"pets"}').ok).toBe(false)
    expect(parseSuggestions('   ').ok).toBe(false)
  })
})

describe('planApply — Übernahme in eine ContactPatch', () => {
  it('setzt Skalarfelder und zählt sie', () => {
    const { patch, applied } = planApply(contact, [
      { id: 'a', target: 'location', value: 'Bonn', evidence: '' },
      { id: 'b', target: 'familyStatus', value: 'verheiratet', evidence: '' },
    ])
    expect(patch.location).toBe('Bonn')
    expect(patch.familyStatus).toBe('verheiratet')
    expect(applied).toBe(2)
  })

  it('überspringt ein Geburtsdatum, das nicht ISO-formatiert ist', () => {
    const withValid = planApply(contact, [{ id: 'a', target: 'birthday', value: '1980-05-05', evidence: '' }])
    expect(withValid.patch.birthday).toBe('1980-05-05')

    const withInvalid = planApply(contact, [{ id: 'a', target: 'birthday', value: '3. Juli', evidence: '' }])
    expect(withInvalid.patch.birthday).toBeUndefined()
    expect(withInvalid.skipped[0]).toContain('kein gültiges Datum')
  })

  it('hängt neue Anknüpfungspunkte an und überspringt Dubletten', () => {
    const { patch, applied, skipped } = planApply(contact, [
      { id: 'x', target: 'sideFact', value: 'Kochen', evidence: '', category: 'hobby' },
      { id: 'y', target: 'sideFact', value: 'segeln', evidence: '' }, // Dublette (case-insensitiv)
    ])
    expect(patch.sideFacts?.map((f) => f.label)).toEqual(['Segeln', 'Kochen'])
    expect(applied).toBe(1)
    expect(skipped[0]).toContain('bereits vorhanden')
  })

  it('hängt Kunden mit withUs-Flag an', () => {
    const { patch } = planApply(contact, [
      { id: 'x', target: 'customer', value: 'Nordmetall', evidence: '', withUs: true },
      { id: 'y', target: 'customer', value: 'Beta GmbH', evidence: '' },
    ])
    const added = patch.customers?.filter((c) => c.name !== 'ACME')
    expect(added).toEqual([
      { id: 'x', name: 'Nordmetall', withUs: true },
      { id: 'y', name: 'Beta GmbH', withUs: false },
    ])
  })

  it('übernimmt nie einen als Art. 9 blockierten Vorschlag', () => {
    const { patch, applied, skipped } = planApply(contact, [
      { id: 'x', target: 'sideFact', value: 'krank', evidence: '', blocked: true, blockReason: 'Gesundheit' },
    ])
    expect(patch.sideFacts).toBeUndefined()
    expect(applied).toBe(0)
    expect(skipped[0]).toContain('Art. 9')
  })

  it('liefert eine leere Patch, wenn nichts bestätigt wurde', () => {
    const { patch, applied } = planApply(contact, [])
    expect(patch).toEqual({})
    expect(applied).toBe(0)
  })
})
