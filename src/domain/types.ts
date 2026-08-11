// Domain types for the Partner CSM tool ("Partner Facebook").
// Mirrors the Supabase schema in /supabase/migrations.

export type Role = 'overall_admin' | 'sub_admin' | 'account_manager'

/** Relationship traffic-light rated by RMs / management. */
export type TrafficLight = 'green' | 'amber' | 'red' | 'neutral'

/** One dated entry in a contact's sentiment (traffic-light) history. */
export interface SentimentEntry {
  at: string // ISO timestamp
  value: TrafficLight
  byName?: string
}

/**
 * LinkedIn presence is an explicit, verifiable state — not just a URL.
 * 'no_account' means "we checked, this person has none" (distinct from 'unknown').
 */
export type LinkedInStatus = 'has_account' | 'no_account' | 'unknown'

export interface LinkedInInfo {
  status: LinkedInStatus
  url?: string
  /** Who confirmed the has/no-account state, and when (audit of the check).
   * The id is what the DB stores (profiles fk); the name is for display. */
  verifiedById?: string
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

/** Role in the buying center (Salesforce-account-map style). */
export type BuyingRole = 'champion' | 'supporter' | 'neutral' | 'blocker' | 'gatekeeper'

export type SideFactCategory = 'hobby' | 'sport' | 'family' | 'interest' | 'other'

export interface SideFact {
  id: string
  label: string
  category: SideFactCategory
}

export interface GalleryPhoto {
  id: string
  url: string
  caption?: string
}

/** Ein benannter Social-Media-Link (jsonb-Array auf contacts.social_links). */
export interface SocialLink {
  label: string
  url: string
}

export interface Region {
  id: string
  name: string
  /**
   * Kein echtes Vertriebsgebiet, sondern ein Sammelbecken für Kontakte ohne
   * verlässliche Regionsangabe (contacts.region_id ist NOT NULL, sie brauchen
   * also ein Ziel). Die Datenbank führt das Kennzeichen, damit eine Umbenennung
   * es nicht aushebelt — siehe Migration 0024.
   */
  isPlaceholder: boolean
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
  /** Employer/organization — the tool maps partners across companies (Telekom, Apple, …). */
  company?: string
  team?: string
  email?: string
  /** Dienstliche Festnetznummer — Geschäftsdatum, sichtbar wie die E-Mail. */
  phoneWork?: string
  /** Dienstliches Mobiltelefon — ebenfalls Geschäftsdatum. */
  phoneMobile?: string
  /**
   * Private Nummer. Gehört in die sensible Stufe (siehe SENSITIVE_CONTACT_FIELDS)
   * und wird für Account Manager serverseitig auf NULL gesetzt — anders als die
   * beiden dienstlichen Nummern.
   */
  phonePrivate?: string
  /** Durchwahl / zweite Dienstnummer — Geschäftsdatum wie phoneWork. */
  phoneDirect?: string
  /**
   * Private E-Mail. Sensibel (siehe SENSITIVE_CONTACT_FIELDS) und für Account
   * Manager serverseitig auf NULL gesetzt — anders als die dienstliche E-Mail.
   */
  emailPrivate?: string
  /** Dienstanschrift (Büro/Post) — Geschäftsdatum, bewusst NICHT sensibel. */
  businessAddress?: string
  /** Assistenz als einfache Textfelder (kein eigener Personendatensatz). */
  assistantName?: string
  assistantContact?: string
  /** Weitere Social-Media-Links (jsonb-Array). Geschäftsdatum. */
  socialLinks?: SocialLink[]
  birthday?: string // YYYY-MM-DD
  location?: string
  familyStatus?: string
  children?: string
  pets?: string
  linkedin: LinkedInInfo
  sentiment: TrafficLight
  sentimentHistory?: SentimentEntry[]
  /** Individual touch-frequency target in days (Kadenz); unset = global 60/90 default. */
  cadenceDays?: number
  /** Role in the buying center; unset = not yet assessed. */
  buyingRole?: BuyingRole
  activeDevices?: string
  wonCustomersCount: number
  freeText?: string
  sideFacts: SideFact[]
  customers: CustomerLink[]
  gallery?: GalleryPhoto[]
  createdAt: string
  updatedAt: string
}

// --- Contact-to-contact relationships (the "Beziehungsnetz") ---

export type ContactLinkKind = 'reports_to' | 'knows' | 'influences'

export interface ContactLink {
  id: string
  fromContactId: string
  toContactId: string
  kind: ContactLinkKind
  note?: string
}

// --- "Wer kann helfen?" board (intro requests) ---

export type IntroRequestStatus = 'open' | 'resolved'

export interface IntroRequest {
  id: string
  /** What is needed, e.g. "Draht zum Einkauf Region Süd". */
  text: string
  createdById: string
  createdByName: string
  createdAt: string
  status: IntroRequestStatus
  /** Who offered to help (set when resolved). */
  helperName?: string
  resolvedAt?: string
}

// --- Events ---

export type AttendanceStatus = 'invited' | 'accepted' | 'declined' | 'attended' | 'no_show'

/** Named EventItem (not Event) to avoid shadowing the DOM Event type. */
export interface EventItem {
  id: string
  name: string
  date: string // YYYY-MM-DD — Start (bei eintägigen Events der einzige Tag)
  /** Enddatum bei mehrtägigen Events; undefined = eintägig. */
  endDate?: string // YYYY-MM-DD
  location?: string
  description?: string
}

export interface EventAttendee {
  contactId: string
  status: AttendanceStatus
  /** "Wofür" — why they're coming / what to discuss on site. */
  purpose?: string
  /** Standtermin als Zeitpunkt (ISO); undefined = kein Termin vereinbart. */
  slotAt?: string
  /** Dauer des Termins in Minuten; undefined = Standarddauer. */
  slotMinutes?: number
  /** Treffpunkt vor Ort, z. B. „Halle 4, Stand B3". */
  meetingPoint?: string
}

/**
 * Ein unbekannter Gast eines Events — jemand, den man am Stand trifft, der (noch)
 * kein Kontakt ist. Nur mit Namen erfasst; per promoteGuestToContact später zu
 * einem echten Contact befördert (Migration 0028).
 */
export interface EventGuest {
  id: string
  eventId: string
  name: string
  company?: string
  note?: string
  /** Gesetzt, sobald der Gast zu einem Kontakt gemacht wurde. */
  promotedContactId?: string
}

// --- Reminders (self-set) ---

export interface Reminder {
  id: string
  contactId: string
  dueDate: string // YYYY-MM-DD
  dueTime?: string // HH:MM, undefined = ganztägig
  text: string
  done: boolean
  createdByName: string
}

// --- Soll-Organisationsstruktur der Partner (Abdeckungsanalyse) ---

/**
 * Eine Organisationseinheit eines Partners. `team === undefined` bezeichnet die
 * Abteilungsebene selbst (Leitung, Assistenz, Stabsstellen).
 */
export interface OrgUnit {
  id: string
  company: string
  department: string
  team: string | null
  note?: string
}

// --- Änderungsprotokoll (DSGVO-Rechenschaftspflicht) ---

export type AuditAction = 'insert' | 'update' | 'delete'

/**
 * Ein Protokolleintrag. Enthält bewusst KEINE Feldwerte, nur die Namen der
 * geänderten Spalten — sonst lägen die Personendaten doppelt (Migration 0019).
 */
export interface AuditEntry {
  id: number
  at: string
  action: AuditAction
  /** 'contact' | 'contact_photo' | 'side_fact' */
  entity: string
  entityId?: string
  actorId?: string
  actorName?: string
  /** Geänderte Spalten bei 'update'. */
  fields?: string[]
}

// --- Event notes (quick capture on site) ---

export type NoteAttachmentKind = 'image' | 'audio'

export interface NoteAttachment {
  id: string
  kind: NoteAttachmentKind
  url: string // data URL in the mock; Storage object URL in production
  name?: string
  /** Voice-memo transcript (manual for now; auto via EU AI endpoint later). */
  transcript?: string
}

export interface EventNote {
  id: string
  eventId: string
  text: string
  authorName: string
  createdAt: string
  attachments: NoteAttachment[]
  /** Optional: the attendee this note is about (feeds their timeline). */
  contactId?: string
  /** Optional: der unbekannte Gast, um den es geht (Alternative zu contactId). */
  guestId?: string
}
