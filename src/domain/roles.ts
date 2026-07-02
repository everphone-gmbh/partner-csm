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
 * Returns a copy of the contact with personal fields stripped for roles that
 * may not see them. Privileged roles get the contact unchanged.
 */
export function redactContactForRole(contact: Contact, role: Role): Contact {
  if (canViewSensitiveFields(role)) return contact
  return {
    ...contact,
    birthday: undefined,
    location: undefined,
    familyStatus: undefined,
    children: undefined,
    pets: undefined,
    freeText: undefined,
    activeDevices: undefined,
    sideFacts: [],
    gallery: [],
  }
}
