import { useMemo } from 'react'
import type { Contact, OrgUnit } from '@/domain/types'
import { unitLabel } from '@/domain/coverage'
import { repository } from '@/data/repositoryProvider'
import { useRepoQuery } from '@/app/useRepoQuery'

/** Vorschlagslisten für die Freitextfelder Team und Firma (Typeahead). */
export interface FieldSuggestions {
  teams: string[]
  companies: string[]
}

export const EMPTY_SUGGESTIONS: FieldSuggestions = { teams: [], companies: [] }

/**
 * Eindeutige, sortierte Vorschlagsliste: getrimmt, leere Werte raus, Groß-/
 * Kleinschreibung zählt nicht als Unterschied — es gewinnt die zuerst gesehene
 * Schreibweise. Die Aufrufer reichen deshalb die org_units (Telekom-Soll-
 * Struktur) VOR den Kontaktwerten herein: ihre Schreibweise ist die offizielle,
 * der Freitext an Kontakten nur die zweite Quelle.
 */
export function uniqueSorted(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>()
  for (const raw of values) {
    const value = raw?.replace(/\s+/g, ' ').trim()
    if (!value) continue
    const key = value.toLocaleLowerCase('de')
    if (!seen.has(key)) seen.set(key, value)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'de'))
}

/**
 * Team-Vorschläge kommen aus `contacts.team` und der Soll-Struktur. Aus einer
 * org_unit wird dabei NICHT das nackte `team` („Mobilfunk“), sondern die
 * Bezeichnung, die im Team-Feld eines Kontakts erwartet wird — „Abteilung /
 * Team“ bzw. „Abteilung“ (siehe `unitLabel` in domain/coverage.ts). Nur so
 * passen die vorgeschlagenen Werte später zur Abdeckungsanalyse.
 */
export function collectSuggestions(contacts: Contact[], orgUnits: OrgUnit[]): FieldSuggestions {
  return {
    teams: uniqueSorted([
      ...orgUnits.map((u) => unitLabel(u.department, u.team)),
      ...contacts.map((c) => c.team),
    ]),
    companies: uniqueSorted([...orgUnits.map((u) => u.company), ...contacts.map((c) => c.company)]),
  }
}

/**
 * Lädt Kontakte + org_units einmal und liefert die Vorschlagslisten. Bis die
 * Daten da sind (oder wenn das Laden scheitert), sind die Listen leer — das
 * Feld bleibt ein normales Freitextfeld, nur ohne Vorschläge.
 */
export function useFieldSuggestions(): FieldSuggestions {
  const { data } = useRepoQuery(
    () => Promise.all([repository.listContacts(), repository.listOrgUnits()]),
    [],
  )
  return useMemo(() => (data ? collectSuggestions(data[0], data[1]) : EMPTY_SUGGESTIONS), [data])
}
