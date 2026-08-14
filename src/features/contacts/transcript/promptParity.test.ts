import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { EXTRACTION_RULES } from './extraction'

/**
 * Der Extraktions-Prompt existiert zweimal: EXTRACTION_RULES (Client, manueller
 * Gemini-Weg) und als Kopie in der Edge Function (Auto-Weg). Deno-Code lässt
 * sich nicht in Vitest importieren, deshalb wird die Function als Text gelesen.
 * Läuft dieser Test rot, wurden die Regeln nur auf einer Seite geändert —
 * dieselbe Divergenz-Klasse wie bei der doppelten Firmennamen-Normalisierung
 * (Fallstrick 5 im Runbook).
 */
describe('Prompt-Parität Client ↔ Edge Function', () => {
  it('die Edge Function enthält den REGELN-Block wortgleich', () => {
    // Pfad relativ zum Projektstamm — Vitest läuft von dort, und import.meta.url
    // ist hier keine file://-URL.
    const fnSource = readFileSync('supabase/functions/extract-transcript/index.ts', 'utf8')
    expect(fnSource).toContain(EXTRACTION_RULES)
  })
})
