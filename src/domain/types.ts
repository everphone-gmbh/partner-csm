// Domain types for the Partner CSM tool ("Partner Facebook").
// Mirrors the Supabase schema in /supabase/migrations.

export type Role = 'overall_admin' | 'sub_admin' | 'account_manager'

/** Relationship traffic-light rated by RMs / management. */
export type TrafficLight = 'green' | 'amber' | 'red' | 'neutral'

/**
 * LinkedIn presence is an explicit, verifiable state — not just a URL.
 * 'no_account' means "we checked, this person has none" (distinct from 'unknown').
 */
export type LinkedInStatus = 'has_account' | 'no_account' | 'unknown'

export interface LinkedInInfo {
  status: LinkedInStatus
  url?: string
  /** Who confirmed the has/no-account state, and when (audit of the check). */
  verifiedByName?: string
  verifiedAt?: string // ISO date
}

export type ActivityType = 'call' | 'email' | 'meeting' | 'note' | 'social'

export type AttachmentKind = 'image' | 'document' | 'link'

export interface Attachment {
  id: string
  name: string
  kind: AttachmentKind
  url?: string
  sizeLabel?: string
}

export interface Activity {
  id: string
  contactId: string
  type: ActivityType
  occurredAt: string // ISO timestamp
  authorId: string
  authorName: string // attribution: who logged this
  body: string
  aiSummary?: string
  attachments: Attachment[]
}

export interface CustomerLink {
  id: string
  name: string
  /** true = partner collaborates WITH us; false = active WITHOUT us (potential). */
  withUs: boolean
  salesforceUrl?: string
}

export type SideFactCategory = 'hobby' | 'sport' | 'family' | 'interest' | 'other'

export interface SideFact {
  id: string
  label: string
  category: SideFactCategory
}

export interface Region {
  id: string
  name: string
}

export interface AppUser {
  id: string
  name: string
  role: Role
  regionId?: string
}

export interface Contact {
  id: string
  fullName: string
  position: string
  photoUrl?: string | null
  regionId: string
  relationshipManagerId: string
  email?: string
  birthday?: string // YYYY-MM-DD
  location?: string
  familyStatus?: string
  children?: string
  pets?: string
  linkedin: LinkedInInfo
  sentiment: TrafficLight
  activeDevices?: string
  wonCustomersCount: number
  freeText?: string
  sideFacts: SideFact[]
  customers: CustomerLink[]
  createdAt: string
  updatedAt: string
}

// --- Events ---

export type AttendanceStatus = 'invited' | 'accepted' | 'declined' | 'attended' | 'no_show'

/** Named EventItem (not Event) to avoid shadowing the DOM Event type. */
export interface EventItem {
  id: string
  name: string
  date: string // YYYY-MM-DD
  location?: string
  description?: string
}

export interface EventAttendee {
  contactId: string
  status: AttendanceStatus
  /** "Wofür" — why they're coming / what to discuss on site. */
  purpose?: string
}

// --- Reminders (self-set) ---

export interface Reminder {
  id: string
  contactId: string
  dueDate: string // YYYY-MM-DD
  text: string
  done: boolean
  createdByName: string
}
