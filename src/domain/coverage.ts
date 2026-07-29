import type { Activity, Contact, OrgUnit } from './types'

/**
 * Abdeckungsanalyse: zu welchen Einheiten eines Partners besteht eine echte
 * Beziehung — und zu welchen nicht?
 *
 * Bewusst anders als die Regionen-Abdeckung im Dashboard: die misst, wie gut
 * die BEKANNTEN Kontakte gepflegt sind. Hier ist die Soll-Struktur der Maßstab,
 * dadurch fallen auch Einheiten auf, zu denen gar kein Kontakt existiert.
 */

/** Zeitfenster, in dem ein Kontakt als „angesprochen" gilt. */
export const TOUCH_WINDOW_DAYS = 90

/**
 * none    — kein Kontakt auf dem Schirm (die eigentliche Lücke)
 * listed  — Namen vorhanden, aber niemand betreut sie
 * started — betreut, aber Beziehung noch nicht bewertet
 * covered — betreut UND bewertet
 */
export type CoverageStatus = 'none' | 'listed' | 'started' | 'covered'

export interface CoverageRow {
  key: string
  company: string
  department: string
  /** null = Abteilungsebene (Leitung, Assistenz, Stabsstellen). */
  team: string | null
  /** true, wenn die Zeile nicht aus der Soll-Struktur kommt. */
  unlisted?: boolean
  contacts: number
  managed: number
  rated: number
  touched: number
  status: CoverageStatus
}

export interface CoverageSummary {
  units: number
  unitsWithoutContact: number
  unitsWithoutManager: number
  unitsCovered: number
}

/** Team-Bezeichner vergleichbar machen (Leerraum, Tabulatoren, Groß/Klein). */
export function normalizeUnitKey(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Schlüssel einer Einheit. Muss zum Format von `contacts.team` passen:
 * „Abteilung / Team", bzw. nur „Abteilung" auf Abteilungsebene.
 */
export function unitKey(company: string, department: string, team: string | null): string {
  const label = team ? `${department} / ${team}` : department
  return `${normalizeUnitKey(company)}|${normalizeUnitKey(label)}`
}

function statusFor(contacts: number, managed: number, rated: number): CoverageStatus {
  if (contacts === 0) return 'none'
  if (managed === 0) return 'listed'
  if (rated === 0) return 'started'
  return 'covered'
}

/**
 * Verbindet Soll-Struktur mit den vorhandenen Kontakten.
 *
 * Kontakte, deren Team zu keiner Einheit passt (etwa der Freitext aus
 * Salesforce), landen NICHT unter den Tisch, sondern als eigene Zeilen mit
 * `unlisted` — sonst würde die Analyse Beziehungen verschweigen, die es gibt.
 */
export function buildCoverage(
  units: OrgUnit[],
  contacts: Contact[],
  activities: Activity[] = [],
  today: Date = new Date(),
): { rows: CoverageRow[]; summary: CoverageSummary } {
  const cutoff = today.getTime() - TOUCH_WINDOW_DAYS * 86_400_000
  const touchedContactIds = new Set(
    activities.filter((a) => Date.parse(a.occurredAt) >= cutoff).map((a) => a.contactId),
  )

  // Kontakte nach ihrem Einheiten-Schlüssel bündeln.
  const byKey = new Map<string, Contact[]>()
  for (const contact of contacts) {
    const key = `${normalizeUnitKey(contact.company)}|${normalizeUnitKey(contact.team)}`
    const list = byKey.get(key)
    if (list) list.push(contact)
    else byKey.set(key, [contact])
  }

  const metrics = (list: Contact[]) => {
    const managed = list.filter((c) => Boolean(c.relationshipManagerId)).length
    const rated = list.filter((c) => c.sentiment !== 'neutral').length
    const touched = list.filter((c) => touchedContactIds.has(c.id)).length
    return { contacts: list.length, managed, rated, touched }
  }

  const rows: CoverageRow[] = []
  const consumed = new Set<string>()

  for (const unit of units) {
    const key = unitKey(unit.company, unit.department, unit.team)
    consumed.add(key)
    const m = metrics(byKey.get(key) ?? [])
    rows.push({
      key,
      company: unit.company,
      department: unit.department,
      team: unit.team,
      ...m,
      status: statusFor(m.contacts, m.managed, m.rated),
    })
  }

  // Kontakte außerhalb der Soll-Struktur — nach ihrer eigenen Angabe gruppiert.
  for (const [key, list] of byKey) {
    if (consumed.has(key)) continue
    const sample = list[0]
    const label = (sample.team ?? '').replace(/\s+/g, ' ').trim()
    const m = metrics(list)
    rows.push({
      key,
      company: sample.company ?? '—',
      department: label || 'Ohne Team-Angabe',
      team: null,
      unlisted: true,
      ...m,
      status: statusFor(m.contacts, m.managed, m.rated),
    })
  }

  rows.sort(
    (a, b) =>
      Number(a.unlisted ?? false) - Number(b.unlisted ?? false) ||
      a.company.localeCompare(b.company, 'de') ||
      a.department.localeCompare(b.department, 'de') ||
      (a.team ?? '').localeCompare(b.team ?? '', 'de'),
  )

  // Die Zusammenfassung zählt nur die Soll-Struktur: „unlisted"-Zeilen sind
  // Fundstücke, keine Ziele, und würden die Quote sonst beschönigen.
  const planned = rows.filter((r) => !r.unlisted)
  return {
    rows,
    summary: {
      units: planned.length,
      unitsWithoutContact: planned.filter((r) => r.status === 'none').length,
      unitsWithoutManager: planned.filter((r) => r.managed === 0).length,
      unitsCovered: planned.filter((r) => r.status === 'covered').length,
    },
  }
}

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  none: 'Kein Kontakt',
  listed: 'Nur Namen',
  started: 'Angefangen',
  covered: 'Abgedeckt',
}

export const COVERAGE_VARIANT: Record<CoverageStatus, 'destructive' | 'warning' | 'secondary' | 'success'> = {
  none: 'destructive',
  listed: 'warning',
  started: 'secondary',
  covered: 'success',
}

export const COVERAGE_HINT: Record<CoverageStatus, string> = {
  none: 'Zu dieser Einheit ist niemand erfasst — echte Lücke.',
  listed: 'Namen sind da, aber niemand kümmert sich: Betreuer zuweisen.',
  started: 'Betreut, aber die Beziehung ist noch nicht bewertet.',
  covered: 'Betreut und bewertet.',
}
