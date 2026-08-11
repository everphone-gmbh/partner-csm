import type { Contact, Role } from './types'

/** Higher rank = more access. Drives the 3-tier permission model from the briefing. */
export const ROLE_RANK: Record<Role, number> = {
  account_manager: 1, // ~60% — redacted personal data, AI intro only
  sub_admin: 2, // Relationship Manager — ~95-98%
  overall_admin: 3, // 100%
}

export const ROLE_LABEL: Record<Role, string> = {
  overall_admin: 'Overall Admin',
  sub_admin: 'Relationship Manager',
  account_manager: 'Account Manager',
}

/**
 * Personal-data fields hidden from the lowest (Account-Manager) tier.
 * Kept in one place so the UI can badge "hidden" fields and tests can assert it.
 * This is the app-side half of the GDPR field-level control; the DB half lives
 * in supabase/migrations/0002_rls.sql (the `contact_cards` view).
 */
export const SENSITIVE_CONTACT_FIELDS = [
  'birthday',
  // Die private Nummer, NICHT phoneWork/phoneMobile: eine Dienstnummer ist
  // Geschäftsdatum wie die E-Mail. Muss mit dem is_privileged()-Block der View
  // contact_cards übereinstimmen (Migration 0025), sonst filtert nur eine Ebene.
  'phonePrivate',
  // Private E-Mail — dieselbe Stufe wie die private Nummer. Muss mit dem
  // is_privileged()-Block der View contact_cards übereinstimmen (Migration 0027),
  // sonst filtert nur eine der beiden Ebenen.
  'emailPrivate',
  'familyStatus',
  'children',
  'pets',
  'location',
  'freeText',
  'sideFacts',
  'activeDevices',
  'gallery', // private photos of the data subject — highest-sensitivity tier
] as const

export function canViewSensitiveFields(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.sub_admin
}

/** Lowest tier sees AI summaries of activities, not the raw logbook text. */
export function canViewActivityBody(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.sub_admin
}

/** Only RMs and above may approve changes / rate the relationship traffic-light. */
export function canApprove(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.sub_admin
}

/**
 * Portfolio-Auswertungen (Bericht, Abdeckung, Monitoring) sind nur für den Head
 * (Overall Admin) — Entscheidung Lennart 2026-08-06: RMs pflegen und bearbeiten,
 * sehen aber nicht die Team-übergreifenden Auswertungen. Bewusst getrennt von
 * `canApprove` (= Bearbeiten, bleibt bei RM+), damit RMs weiter voll editieren.
 */
export function canViewAnalytics(role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.overall_admin
}

/**
 * Returns a copy of the contact with personal fields stripped for roles that
 * may not see them. Privileged roles get the contact unchanged.
 */
/** Felder, die als leere Liste statt als undefined zurückkommen müssen. */
const EMPTIED_AS_LIST: ReadonlySet<string> = new Set(['sideFacts', 'gallery'])

export function redactContactForRole(contact: Contact, role: Role): Contact {
  if (canViewSensitiveFields(role)) return contact
  // Wird AUS SENSITIVE_CONTACT_FIELDS abgeleitet, nicht danebengeschrieben:
  // vorher stand hier eine zweite, handgepflegte Liste. Ein neues sensibles Feld
  // in der Konstante blieb dadurch ohne Wirkung — dieselbe Divergenz-Klasse, die
  // den ursprünglichen Blocker verursacht hat (Oberfläche filterte, API nicht).
  // Die dritte Ebene, der is_privileged()-Block der View contact_cards, lässt
  // sich nicht mit ableiten; sie muss bei Änderungen mitgezogen werden.
  const out: Contact = { ...contact }
  // Getrennte, lose typisierte Sicht zum Schreiben: über Contact selbst ist ein
  // indizierter Zugriff nicht möglich, weil TypeScript die Schnittmenge aller
  // Feldtypen bilden würde.
  const writable = out as unknown as Record<string, unknown>
  for (const field of SENSITIVE_CONTACT_FIELDS) {
    writable[field] = EMPTIED_AS_LIST.has(field) ? [] : undefined
  }
  return out
}
