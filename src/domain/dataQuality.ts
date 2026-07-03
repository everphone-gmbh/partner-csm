import type { Contact } from './types'

export interface DuplicatePair {
  a: Contact
  b: Contact
  reason: 'Gleicher Name' | 'Gleiche E-Mail'
}

function normName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Likely duplicates within the existing book: same normalized name or same
 * email. Each pair is reported once (name match wins as the reason).
 */
export function findDuplicateContacts(contacts: Contact[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = []
  const seenPairs = new Set<string>()
  const byName = new Map<string, Contact[]>()
  const byEmail = new Map<string, Contact[]>()

  const pairKey = (a: Contact, b: Contact) => [a.id, b.id].sort().join('|')
  const push = (a: Contact, b: Contact, reason: DuplicatePair['reason']) => {
    const key = pairKey(a, b)
    if (seenPairs.has(key)) return
    seenPairs.add(key)
    pairs.push({ a, b, reason })
  }

  for (const c of contacts) {
    const name = normName(c.fullName)
    for (const other of byName.get(name) ?? []) push(other, c, 'Gleicher Name')
    byName.set(name, [...(byName.get(name) ?? []), c])

    const email = c.email?.trim().toLowerCase()
    if (email) {
      for (const other of byEmail.get(email) ?? []) push(other, c, 'Gleiche E-Mail')
      byEmail.set(email, [...(byEmail.get(email) ?? []), c])
    }
  }
  return pairs
}

/** The fields that make a contact profile actionable, with German labels. */
export const IMPORTANT_FIELDS: { label: string; filled: (c: Contact) => boolean }[] = [
  { label: 'Funktion', filled: (c) => Boolean(c.position.trim()) },
  { label: 'E-Mail', filled: (c) => Boolean(c.email) },
  { label: 'Geburtstag', filled: (c) => Boolean(c.birthday) },
  { label: 'Wohnort', filled: (c) => Boolean(c.location) },
  { label: 'Team', filled: (c) => Boolean(c.team) },
  { label: 'Notiz', filled: (c) => Boolean(c.freeText) },
  { label: 'LinkedIn geprüft', filled: (c) => c.linkedin.status !== 'unknown' },
  { label: 'Beziehung bewertet', filled: (c) => c.sentiment !== 'neutral' },
  { label: 'Anknüpfungspunkte', filled: (c) => c.sideFacts.length > 0 },
]

export interface CompletenessScore {
  pct: number
  missing: string[]
}

/** 0-100 profile completeness over the important fields. */
export function completenessScore(contact: Contact): CompletenessScore {
  const missing = IMPORTANT_FIELDS.filter((f) => !f.filled(contact)).map((f) => f.label)
  const filled = IMPORTANT_FIELDS.length - missing.length
  return { pct: Math.round((filled / IMPORTANT_FIELDS.length) * 100), missing }
}
