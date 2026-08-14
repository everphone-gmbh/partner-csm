/**
 * Transkript-Extraktion (z. B. aus Jamie) — reine Logik, kein React, kein Netz.
 *
 * Ablauf (bewusst ohne eigenen KI-Endpoint, DSGVO-konform über den vorhandenen
 * Gemini-Workspace-Zugang):
 *   1. `buildExtractionPrompt` erzeugt aus Transkript + Kontaktname einen strengen
 *      Prompt. Den führt der Nutzer MANUELL in Gemini (Workspace) aus.
 *   2. Die JSON-Antwort wird per `parseSuggestions` robust eingelesen.
 *   3. Der Nutzer bestätigt einzelne Vorschläge; `planApply` baut daraus eine
 *      `ContactPatch` (Skalare + deduplizierte Anknüpfungspunkte/Kunden).
 *
 * Zwei Sicherungen gegen falsche Daten: (a) Art.-9-Daten (Gesundheit, Religion,
 * Politik, Gewerkschaft, Sexualleben, Herkunft) werden im Prompt ausgeschlossen
 * UND hier zusätzlich markiert (nie automatisch übernommen); (b) nichts wird
 * gespeichert, was der Nutzer nicht einzeln freigegeben hat. Das Transkript
 * selbst wird nie persistiert.
 */
import type { Contact, CustomerLink, SideFact, SideFactCategory } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'

/** Zielfelder, die aus einem Transkript befüllt werden dürfen — bewusst eng. */
export type ExtractionTarget =
  | 'birthday'
  | 'location'
  | 'familyStatus'
  | 'children'
  | 'pets'
  | 'sideFact'
  | 'customer'

const ALLOWED_TARGETS: ReadonlySet<string> = new Set<ExtractionTarget>([
  'birthday',
  'location',
  'familyStatus',
  'children',
  'pets',
  'sideFact',
  'customer',
])

const SIDEFACT_CATEGORIES: ReadonlySet<string> = new Set<SideFactCategory>([
  'hobby',
  'sport',
  'family',
  'interest',
  'other',
])

export interface ExtractionSuggestion {
  /** Client-Id, stabil aus der Position der Antwort — dient auch als React-Key. */
  id: string
  target: ExtractionTarget
  /** Extrahierter Wert (bei sideFact das Label, bei customer der Firmenname). */
  value: string
  /** Wörtliches Beleg-Zitat aus dem Transkript — Grundlage der Freigabe. */
  evidence: string
  /** Nur bei sideFact. */
  category?: SideFactCategory
  /** Nur bei customer: bestehende Zusammenarbeit? */
  withUs?: boolean
  /** Gesetzt, wenn der Vorschlag DSGVO Art. 9 berührt — nie übernehmbar. */
  blocked?: boolean
  blockReason?: string
}

export interface ParseResult {
  ok: boolean
  suggestions: ExtractionSuggestion[]
  /** Fehlermeldung, wenn die Antwort grundsätzlich unbrauchbar war. */
  error?: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Besondere Kategorien nach Art. 9 DSGVO. Hoch-präzise, bewusst konservative
 * Muster: lieber ein legitimer Fakt zu viel markiert (der Nutzer sieht ihn ja)
 * als sensible Daten unbemerkt übernommen. Zweite Ebene hinter dem Prompt.
 */
const ART9_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'Gesundheit', re: /(krank|krankheit|diagnos|therapie|depress|burnout|schwanger|behinder|reha|klinik)/i },
  { label: 'Religion/Weltanschauung', re: /(religi|konfession|kirche|moschee|synagoge|muslim|christ|jüdisch|atheist|glaube)/i },
  { label: 'Politik', re: /(partei|politisch|wähl|cdu|spd|grüne|afd|fdp|\blinke\b)/i },
  { label: 'Gewerkschaft', re: /(gewerkschaft|verdi|ig[ -]?metall|betriebsrat)/i },
  { label: 'Sexualleben/Herkunft', re: /(sexuell|homosex|\bschwul\b|\blesbisch\b|ethni|migrationshintergrund|\brasse\b)/i },
]

function art9Block(text: string): string | undefined {
  for (const p of ART9_PATTERNS) if (p.re.test(text)) return p.label
  return undefined
}

/**
 * Der REGELN-Block des Extraktions-Prompts. Wird wortgleich auch von der Edge
 * Function `supabase/functions/extract-transcript/index.ts` (Auto-Weg)
 * verwendet — bei Änderungen BEIDE Stellen anpassen; `promptParity.test.ts`
 * schlägt Alarm, wenn sie auseinanderlaufen.
 */
export const EXTRACTION_RULES = `REGELN:
- Extrahiere NUR Fakten, die wörtlich im Transkript stehen. Rate nichts, ergänze nichts.
- Antworte AUSSCHLIESSLICH mit einem JSON-Array. Kein weiterer Text, keine Markdown-Codeblöcke.
- Jedes Element hat die Form:
  { "target": <Feld>, "value": <Wert>, "evidence": <wörtliches Zitat>, "category": <nur bei sideFact>, "withUs": <nur bei customer> }
- Erlaubte "target"-Werte:
  - "birthday"     – Geburtsdatum im Format YYYY-MM-DD (nur wenn eindeutig ableitbar)
  - "location"     – Wohnort
  - "familyStatus" – Familienstand
  - "children"     – Kinder (Anzahl/Alter)
  - "pets"         – Haustiere
  - "sideFact"     – privater Anknüpfungspunkt; "category" ist eines von: hobby, sport, family, interest, other
  - "customer"     – erwähnte Firma/Kunde; "withUs" ist true, wenn eine bestehende Zusammenarbeit genannt wird, sonst false
- "evidence" ist ein wörtliches, kurzes Zitat aus dem Transkript, das den Fakt belegt.
- NIEMALS extrahieren (DSGVO Art. 9): Gesundheit, Religion/Weltanschauung, politische Meinung, Gewerkschaftszugehörigkeit, Sexualleben, ethnische Herkunft.
- Gibt es nichts Belegbares, antworte mit: []`

/** Baut den Extraktions-Prompt zum manuellen Ausführen in Gemini (Workspace). */
export function buildExtractionPrompt(transcript: string, contactName: string): string {
  return `Du extrahierst strukturierte Fakten über ${contactName} aus dem folgenden Gesprächstranskript für ein Vertriebs-Beziehungs-CRM.

${EXTRACTION_RULES}

TRANSKRIPT:
"""
${transcript}
"""`
}

/**
 * Entfernt Markdown-Fences und drumherum stehenden Fließtext: schneidet auf den
 * äußersten [...]-Bereich zu. Gemini verpackt Antworten trotz Anweisung manchmal
 * in ```json … ``` oder stellt einen Satz voran.
 */
function isolateJsonArray(raw: string): string {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return trimmed
  return trimmed.slice(start, end + 1)
}

function coerce(item: unknown, index: number): ExtractionSuggestion | null {
  if (typeof item !== 'object' || item === null) return null
  const rec = item as Record<string, unknown>
  const target = rec.target
  const value = typeof rec.value === 'string' ? rec.value.trim() : ''
  const evidence = typeof rec.evidence === 'string' ? rec.evidence.trim() : ''
  if (typeof target !== 'string' || !ALLOWED_TARGETS.has(target)) return null
  if (!value) return null

  const s: ExtractionSuggestion = {
    id: `sug-${index}`,
    target: target as ExtractionTarget,
    value,
    evidence,
  }

  if (s.target === 'sideFact') {
    const c = typeof rec.category === 'string' ? rec.category : ''
    s.category = SIDEFACT_CATEGORIES.has(c) ? (c as SideFactCategory) : 'other'
  }
  if (s.target === 'customer') {
    s.withUs = rec.withUs === true
  }

  const reason = art9Block(`${value} ${evidence}`)
  if (reason) {
    s.blocked = true
    s.blockReason = reason
  }
  return s
}

/** Liest die (manuell aus Gemini kopierte) JSON-Antwort robust ein. */
export function parseSuggestions(raw: string): ParseResult {
  if (!raw.trim()) return { ok: false, suggestions: [], error: 'Keine Antwort eingefügt.' }
  let data: unknown
  try {
    data = JSON.parse(isolateJsonArray(raw))
  } catch {
    return { ok: false, suggestions: [], error: 'Die Antwort ist kein gültiges JSON-Array.' }
  }
  if (!Array.isArray(data)) {
    return { ok: false, suggestions: [], error: 'Erwartet wurde ein JSON-Array.' }
  }
  const suggestions: ExtractionSuggestion[] = []
  data.forEach((item, i) => {
    const s = coerce(item, i)
    if (s) suggestions.push(s)
  })
  return { ok: true, suggestions }
}

export interface ApplyPlan {
  /** Patch für updateContact; leer, wenn nichts anzuwenden ist. */
  patch: ContactPatch
  /** Anzahl tatsächlich übernommener Fakten. */
  applied: number
  /** Übersprungene Vorschläge mit Grund (Dublette, Art. 9, ungültiges Datum). */
  skipped: string[]
}

/**
 * Baut aus den vom Nutzer bestätigten Vorschlägen eine ContactPatch. Rein und
 * ohne Seiteneffekte — die UI ruft danach updateContact auf. Anknüpfungspunkte
 * und Kunden werden an die vorhandenen angehängt (dedupliziert), nie ersetzt.
 */
export function planApply(contact: Contact, approved: ExtractionSuggestion[]): ApplyPlan {
  const patch: ContactPatch = {}
  const sideFacts: SideFact[] = [...contact.sideFacts]
  const customers: CustomerLink[] = [...contact.customers]
  const skipped: string[] = []
  let applied = 0

  for (const s of approved) {
    if (s.blocked) {
      skipped.push(`${s.value} (Art. 9: ${s.blockReason})`)
      continue
    }
    switch (s.target) {
      case 'birthday':
        if (!ISO_DATE.test(s.value)) {
          skipped.push(`${s.value} (kein gültiges Datum)`)
          break
        }
        patch.birthday = s.value
        applied++
        break
      case 'location':
        patch.location = s.value
        applied++
        break
      case 'familyStatus':
        patch.familyStatus = s.value
        applied++
        break
      case 'children':
        patch.children = s.value
        applied++
        break
      case 'pets':
        patch.pets = s.value
        applied++
        break
      case 'sideFact':
        if (sideFacts.some((f) => f.label.toLowerCase() === s.value.toLowerCase())) {
          skipped.push(`${s.value} (bereits vorhanden)`)
          break
        }
        sideFacts.push({ id: s.id, label: s.value, category: s.category ?? 'other' })
        applied++
        break
      case 'customer':
        if (customers.some((c) => c.name.toLowerCase() === s.value.toLowerCase())) {
          skipped.push(`${s.value} (bereits vorhanden)`)
          break
        }
        customers.push({ id: s.id, name: s.value, withUs: s.withUs ?? false })
        applied++
        break
    }
  }

  // sideFacts/customers werden als Ganzes ersetzt (Repository-Semantik) — nur
  // setzen, wenn wir tatsächlich etwas angehängt haben.
  if (sideFacts.length !== contact.sideFacts.length) patch.sideFacts = sideFacts
  if (customers.length !== contact.customers.length) patch.customers = customers

  return { patch, applied, skipped }
}
