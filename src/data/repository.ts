import type { EverphoneAccount } from '@/domain/everphoneAccounts'
import type {
  Activity,
  AppUser,
  AuditEntry,
  AttendanceStatus,
  BuyingRole,
  Contact,
  ContactLink,
  ContactLinkKind,
  CustomerLink,
  EventAttendee,
  EventGuest,
  EventItem,
  EventNote,
  GalleryPhoto,
  IntroRequest,
  LinkedInInfo,
  NoteAttachment,
  OrgUnit,
  Region,
  Reminder,
  SentimentEntry,
  SideFact,
  SocialLink,
  TrafficLight,
} from '@/domain/types'

export interface NewActivity {
  contactId: string
  type: Activity['type']
  occurredAt: string
  authorId: string
  authorName: string
  body: string
}

export interface NewContact {
  fullName: string
  position: string
  regionId: string
  relationshipManagerId: string
  company?: string
  team?: string
  email?: string
  phoneWork?: string
  phoneMobile?: string
  phonePrivate?: string
  birthday?: string
  location?: string
  familyStatus?: string
  children?: string
  pets?: string
  activeDevices?: string
  wonCustomersCount?: number
  freeText?: string
  linkedin?: LinkedInInfo
  sideFacts?: SideFact[]
}

/**
 * The exhaustive set of contact fields the UI may edit. Every key here MUST
 * be persisted by every Repository implementation — the contract tests in
 * repositoryContract.test.ts enforce the round-trip for both backends.
 *
 * Semantics: key present = write it (undefined clears an optional field);
 * key absent = leave unchanged. sideFacts is replaced wholesale; gallery is
 * diffed by id (photos are relation rows, not a column, on Supabase).
 */
/**
 * Was eine Massenzuordnung setzen darf — bewusst eng gehalten. Alles andere
 * (Name, Notizen, sensible Felder) gehört an den einzelnen Kontakt und nicht in
 * eine Aktion, die 400 Datensätze auf einmal überschreibt.
 */
export interface BulkAssignPatch {
  regionId?: string
  relationshipManagerId?: string
}

export interface ContactPatch {
  fullName?: string
  position?: string
  photoUrl?: string | null
  regionId?: string
  relationshipManagerId?: string
  company?: string
  team?: string
  email?: string
  phoneWork?: string
  phoneMobile?: string
  phonePrivate?: string
  birthday?: string
  location?: string
  familyStatus?: string
  children?: string
  pets?: string
  phoneDirect?: string
  emailPrivate?: string
  businessAddress?: string
  assistantName?: string
  assistantContact?: string
  socialLinks?: SocialLink[]
  linkedin?: LinkedInInfo
  sentiment?: TrafficLight
  sentimentHistory?: SentimentEntry[]
  cadenceDays?: number
  buyingRole?: BuyingRole
  activeDevices?: string
  wonCustomersCount?: number
  freeText?: string
  sideFacts?: SideFact[]
  gallery?: GalleryPhoto[]
  /** Replace-style like sideFacts; the adapter diffs the customer links. */
  customers?: CustomerLink[]
}

export interface NewContactLink {
  fromContactId: string
  toContactId: string
  kind: ContactLinkKind
  note?: string
}

export interface NewIntroRequest {
  text: string
  createdById: string
  createdByName: string
}

export interface NewEvent {
  name: string
  date: string
  endDate?: string
  location?: string
  description?: string
}

export interface NewReminder {
  contactId: string
  dueDate: string
  dueTime?: string // HH:MM
  text: string
  createdByName: string
}

/** Feldweise Änderung eines Teilnehmers; fehlende Schlüssel bleiben unberührt. */
export interface AttendeePatch {
  status?: AttendanceStatus
  purpose?: string
  /** null löscht den Termin (und damit auch Dauer). */
  slotAt?: string | null
  slotMinutes?: number | null
  meetingPoint?: string | null
}

export interface NewEventNote {
  eventId: string
  text: string
  authorName: string
  attachments: NoteAttachment[]
  /** Ziel der Notiz: entweder ein bestehender Kontakt … */
  contactId?: string
  /** … oder ein unbekannter Gast (Migration 0028). */
  guestId?: string
}

export interface NewEventGuest {
  eventId: string
  name: string
  company?: string
  note?: string
}

/** Feldweise Änderung eines Gastes; fehlende Schlüssel bleiben unberührt. */
export interface EventGuestPatch {
  name?: string
  company?: string
  note?: string
}

/**
 * Data-access seam. The first draft binds to an in-memory mock; a Supabase
 * implementation will later satisfy the same interface with zero UI changes.
 */
export interface Repository {
  listRegions(): Promise<Region[]>
  /**
   * Legt ein neues Vertriebsgebiet an (immer als echte Region, nie als
   * Platzhalter). Der Name wird getrimmt; ein leerer Name ist ein Fehler.
   * Schreibrecht haben serverseitig nur RM+ (RLS `regions_insert`, 0029).
   */
  createRegion(name: string): Promise<Region>
  /**
   * Benennt ein bestehendes Gebiet um (UPDATE-dann-Neulesen, kein upsert). Der
   * Name wird getrimmt; ein leerer Name ist ein Fehler. Das Platzhalter-Kennzeichen
   * bleibt unberührt — die Oberfläche verhindert das Umbenennen des Platzhalters,
   * die RLS (`regions_update`, 0029) beschränkt den Schreibzugriff auf RM+.
   */
  renameRegion(id: string, name: string): Promise<Region>
  listUsers(): Promise<AppUser[]>
  listContacts(): Promise<Contact[]>
  getContact(id: string): Promise<Contact | undefined>
  createContact(input: NewContact): Promise<Contact>
  updateContact(id: string, patch: ContactPatch): Promise<Contact>
  /** GDPR right to erasure: removes the contact and (via cascade) all
   * dependent personal data — activities, side facts, photos, reminders,
   * event attendance. Admin-gated in the UI and by RLS (0008). */
  deleteContact(id: string): Promise<void>
  /** Handover when a manager leaves: moves all their contacts, returns the count. */
  reassignContacts(fromUserId: string, toUserId: string): Promise<number>

  /**
   * Setzt Region und/oder Betreuer für viele Kontakte in einem Schritt.
   *
   * Bewusst mit expliziten IDs statt einem serverseitigen Filter: die Oberfläche
   * entscheidet über ihre eigenen Filter (Region, Firma, Team, Suche), was
   * ausgewählt ist. Ein falsch gesetzter Filter kann so nicht den halben Bestand
   * umschreiben — geändert wird genau, was der Nutzer angehakt hat.
   *
   * Nicht übergebene Felder bleiben unangetastet; es ist ein Teil-Update.
   *
   * @returns Anzahl der tatsächlich geänderten Kontakte
   */
  bulkAssign(contactIds: string[], patch: BulkAssignPatch): Promise<number>
  /** Links where the contact is either endpoint (the Beziehungsnetz). */
  listContactLinks(contactId: string): Promise<ContactLink[]>
  /** Alle Verknüpfungen — für die Wegsuche über das gesamte Netz. */
  listAllContactLinks(): Promise<ContactLink[]>
  addContactLink(input: NewContactLink): Promise<ContactLink>
  deleteContactLink(id: string): Promise<void>
  listActivities(contactId: string): Promise<Activity[]>
  listAllActivities(): Promise<Activity[]>
  addActivity(input: NewActivity): Promise<Activity>
  /** Team-wide "Wer kann helfen?" board. */
  listIntroRequests(): Promise<IntroRequest[]>
  addIntroRequest(input: NewIntroRequest): Promise<IntroRequest>
  resolveIntroRequest(id: string, helperName: string): Promise<IntroRequest>
  deleteIntroRequest(id: string): Promise<void>
  listEvents(): Promise<EventItem[]>
  getEvent(id: string): Promise<EventItem | undefined>
  createEvent(input: NewEvent): Promise<EventItem>
  listEventAttendees(eventId: string): Promise<EventAttendee[]>
  setAttendee(
    eventId: string,
    contactId: string,
    patch: AttendeePatch,
  ): Promise<EventAttendee>
  removeAttendee(eventId: string, contactId: string): Promise<void>
  listEventNotes(eventId: string): Promise<EventNote[]>
  addEventNote(input: NewEventNote): Promise<EventNote>
  /** Unbekannte Gäste eines Events (Migration 0028). */
  listEventGuests(eventId: string): Promise<EventGuest[]>
  addEventGuest(input: NewEventGuest): Promise<EventGuest>
  updateEventGuest(id: string, patch: EventGuestPatch): Promise<EventGuest>
  /** Entfernt den Gast und (per Kaskade) die Notizen über ihn. */
  removeEventGuest(id: string): Promise<void>
  /**
   * Macht aus einem Gast einen echten Kontakt: legt den Contact an
   * (fullName = Gastname, company = Gastfirma, position = ''), vermerkt ihn am
   * Gast (promotedContactId) und pflegt dessen Event-Notizen um
   * (guest_id → contact_id). Gibt den neuen Kontakt zurück.
   */
  promoteGuestToContact(
    guestId: string,
    input: { regionId: string; relationshipManagerId: string },
  ): Promise<Contact>
  /** All reminders, or just those for one contact when contactId is given. */
  listReminders(contactId?: string): Promise<Reminder[]>
  addReminder(input: NewReminder): Promise<Reminder>
  toggleReminder(id: string, done: boolean): Promise<Reminder>
  deleteReminder(id: string): Promise<void>
  /**
   * Everphone-Bestandskunden zu den übergebenen Kundennamen (exakter Abgleich
   * auf dem normalisierten Namen). Nur die benötigten Zeilen — die
   * Referenzliste hat Tausende Einträge und gehört nicht in den Client.
   */
  matchEverphoneAccounts(customerNames: string[]): Promise<EverphoneAccount[]>
  /** Namenssuche über die Referenzliste, für die Autovervollständigung. */
  searchEverphoneAccounts(term: string, limit?: number): Promise<EverphoneAccount[]>
  /**
   * Änderungsprotokoll, neueste zuerst. Nur für privilegierte Rollen lesbar
   * (RLS `audit_read`); geschrieben wird ausschließlich per DB-Trigger.
   */
  listAuditLog(limit?: number): Promise<AuditEntry[]>
  /** Soll-Organisationsstruktur der Partner — Maßstab der Abdeckungsanalyse. */
  listOrgUnits(): Promise<OrgUnit[]>
}
