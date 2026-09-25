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
 * Einen gespeicherten Aktivitätseintrag korrigieren oder löschen darf, wer ihn
 * geschrieben hat, sowie RM aufwärts (Policies `activities_update` 0034 /
 * `activities_delete` 0008).
 *
 * Zusätzlich muss man den Text überhaupt sehen können: für den Account-Manager-
 * Tier ist `body` in `activity_cards` wegredigiert. Ohne diese Bedingung böte
 * die Oberfläche ihm an, einen Text zu ändern, den sie ihm nicht zeigt — er
 * würde ihn mit seiner Eingabe überschreiben, ohne je das Original gesehen zu
 * haben.
 */
export function canEditActivity(role: Role, authorId: string, userId: string): boolean {
  if (!canViewActivityBody(role)) return false
  return canApprove(role) || authorId === userId
}

/**
 * Das Kontaktfoto darf JEDE Rolle pflegen (Entscheidung Jannik, 2026-09-17).
 *
 * Bewusst OHNE `role`-Parameter: die Grenze ist nicht die Rolle, sondern die
 * Sichtbarkeit des Kontakts — wer ihn sieht, darf sein Foto setzen, ersetzen
 * und entfernen. Für den Account Manager ist das seine eigene Region, und genau
 * so funktioniert die Sichtbarkeit ohnehin schon. Ein Parameter würde nur dazu
 * einladen, hier später wieder nach Rolle zu staffeln.
 *
 * Serverseitige Entsprechung ist Migration 0032: `set_contact_photo()` prüft
 * `can_see_contact()` und die Pfadkonvention, und die Ablageregeln
 * `avatars_write`/`avatars_update`/`avatars_delete` prüfen ebenfalls
 * `can_see_contact()` — wie `avatars_read` es schon immer tat.
 *
 * `canApprove` bleibt die Schranke für alles ANDERE am Kontakt (Name, Position,
 * Beziehungs-Ampel, LinkedIn, Stammdaten); `contacts_update` steht serverseitig
 * weiter auf `is_privileged()`, weil RLS zeilen- und nicht spaltenbasiert ist.
 * Die Fotogalerie bleibt ebenfalls RM+ — `gallery` ist ein sensibles Feld.
 */
export function canManageContactPhoto(): boolean {
  return true
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
 * Rollen und Regionen vorhandener Konten vergeben — die Seite „Team & Rechte".
 *
 * Bewusst GETRENNT von `canViewAnalytics`, obwohl heute beide bei
 * `overall_admin` stehen. Das sind zwei verschiedene Fragen: `canViewAnalytics`
 * regelt, wer Auswertungen SIEHT (Bericht, Abdeckung, Monitoring); dieses
 * Prädikat regelt, wer Rechte VERGIBT. Sie dürfen auseinanderlaufen — die
 * Rechtevergabe kann später an eine eigene Rolle wandern oder strenger werden,
 * ohne dass jemand dabei die Berichte verliert. Ein gemeinsames Prädikat müsste
 * dafür erst wieder aufgetrennt werden, und bis dahin verschöbe jede Änderung
 * an der einen Frage stillschweigend die andere.
 *
 * Serverseitige Entsprechung ist Migration 0033: die Policy `profiles_update`
 * verlangt `auth_role() = 'overall_admin'`; der Trigger `profiles_guard_change`
 * sperrt zusätzlich die Änderung der EIGENEN Rolle und das Herabstufen des
 * LETZTEN Administrators — beides spiegelt die Oberfläche, damit niemand in
 * einen Fehler klickt.
 *
 * Neue Logins anlegen gehört ausdrücklich NICHT dazu: das braucht die
 * Supabase-Admin-API und damit den Service-Role-Key, der nie im Browser liegen
 * darf. Dafür kommt Google SSO (Entscheidung 2026-09-17).
 */
export function canManageTeam(role: Role): boolean {
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
