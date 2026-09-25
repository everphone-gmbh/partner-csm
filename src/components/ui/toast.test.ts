import { describe, expect, it } from 'vitest'
import { saveErrorMessage } from './toast'

/**
 * Anlass: am 2026-09-24 stand `duplicate key value violates unique constraint
 * "regions_name_key"` als roter Kasten auf dem Bildschirm einer Kollegin. Diese
 * Datei nagelt fest, dass Datenbank-Innereien den Nutzer nicht mehr erreichen.
 */
describe('saveErrorMessage', () => {
  it('übersetzt die Eindeutigkeitsverletzung, die die Meldung ausgelöst hat', () => {
    const err = new Error('duplicate key value violates unique constraint "regions_name_key"')
    const msg = saveErrorMessage(err)
    expect(msg).toBe('Speichern fehlgeschlagen: Diesen Eintrag gibt es schon.')
    // Kein Rest der Originalmeldung bleibt sichtbar.
    expect(msg).not.toMatch(/constraint|duplicate|regions_name_key/i)
  })

  it.each([
    ['new row violates row-level security policy for table "contacts"', 'Dafür fehlt dir die Berechtigung.'],
    ['permission denied for table activities', 'Dafür fehlt dir die Berechtigung.'],
    ['insert or update on table "contacts" violates foreign key constraint "contacts_region_id_fkey"', 'Daran hängen noch andere Daten — deshalb geht das so nicht.'],
    ['null value in column "full_name" violates not-null constraint', 'Ein Pflichtfeld ist leer geblieben.'],
    ['value too long for type character varying(200)', 'Der Text ist zu lang.'],
    ['invalid input syntax for type date: ""', 'Eine Eingabe hat das falsche Format.'],
    ['TypeError: Failed to fetch', 'Keine Verbindung zum Server. Bitte noch einmal versuchen.'],
  ])('übersetzt %j', (raw, expected) => {
    expect(saveErrorMessage(new Error(raw))).toBe(`Speichern fehlgeschlagen: ${expected}`)
  })

  it('reicht eigene, bereits verständliche Meldungen unverändert durch', () => {
    // Diese wirft die App selbst — sie ist schon deutsch und aussagekräftig.
    expect(saveErrorMessage(new Error('Kein Zugriff auf dieses Konto'))).toBe(
      'Speichern fehlgeschlagen: Kein Zugriff auf dieses Konto',
    )
    expect(saveErrorMessage(new Error('Regionsname darf nicht leer sein'))).toBe(
      'Speichern fehlgeschlagen: Regionsname darf nicht leer sein',
    )
  })

  it('kommt auch mit etwas zurecht, das kein Error ist', () => {
    expect(saveErrorMessage('kaputt')).toBe('Speichern fehlgeschlagen: kaputt')
    expect(saveErrorMessage(undefined)).toBe('Speichern fehlgeschlagen: undefined')
  })
})
