import type {
  Activity,
  AppUser,
  AttendanceStatus,
  Contact,
  ContactLink,
  ContactLinkKind,
  EventAttendee,
  EventItem,
  EventNote,
  GalleryPhoto,
  LinkedInInfo,
  NoteAttachment,
  Region,
  Reminder,
  SentimentEntry,
  SideFact,
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
  team?: string
  email?: string
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
export interface ContactPatch {
  fullName?: string
  position?: string
  photoUrl?: string | null
  regionId?: string
  relationshipManagerId?: string
  team?: string
  email?: string
  birthday?: string
  location?: string
  familyStatus?: string
  children?: string
  pets?: string
  linkedin?: LinkedInInfo
  sentiment?: TrafficLight
  sentimentHistory?: SentimentEntry[]
  cadenceDays?: number
  activeDevices?: string
  wonCustomersCount?: number
  freeText?: string
  sideFacts?: SideFact[]
  gallery?: GalleryPhoto[]
}

export interface NewContactLink {
  fromContactId: string
  toContactId: string
  kind: ContactLinkKind
  note?: string
}

export interface NewEvent {
  name: string
  date: string
  location?: string
  description?: string
}

export interface NewReminder {
  contactId: string
  dueDate: string
  text: string
  createdByName: string
}

export interface NewEventNote {
  eventId: string
  text: string
  authorName: string
  attachments: NoteAttachment[]
}

/**
 * Data-access seam. The first draft binds to an in-memory mock; a Supabase
 * implementation will later satisfy the same interface with zero UI changes.
 */
export interface Repository {
  listRegions(): Promise<Region[]>
  listUsers(): Promise<AppUser[]>
  listContacts(): Promise<Contact[]>
  getContact(id: string): Promise<Contact | undefined>
  createContact(input: NewContact): Promise<Contact>
  updateContact(id: string, patch: ContactPatch): Promise<Contact>
  /** GDPR right to erasure: removes the contact and (via cascade) all
   * dependent personal data — activities, side facts, photos, reminders,
   * event attendance. Admin-gated in the UI and by RLS (0008). */
  deleteContact(id: string): Promise<void>
  /** Links where the contact is either endpoint (the Beziehungsnetz). */
  listContactLinks(contactId: string): Promise<ContactLink[]>
  addContactLink(input: NewContactLink): Promise<ContactLink>
  deleteContactLink(id: string): Promise<void>
  listActivities(contactId: string): Promise<Activity[]>
  listAllActivities(): Promise<Activity[]>
  addActivity(input: NewActivity): Promise<Activity>
  listEvents(): Promise<EventItem[]>
  getEvent(id: string): Promise<EventItem | undefined>
  createEvent(input: NewEvent): Promise<EventItem>
  listEventAttendees(eventId: string): Promise<EventAttendee[]>
  setAttendee(
    eventId: string,
    contactId: string,
    patch: { status?: AttendanceStatus; purpose?: string },
  ): Promise<EventAttendee>
  removeAttendee(eventId: string, contactId: string): Promise<void>
  listEventNotes(eventId: string): Promise<EventNote[]>
  addEventNote(input: NewEventNote): Promise<EventNote>
  /** All reminders, or just those for one contact when contactId is given. */
  listReminders(contactId?: string): Promise<Reminder[]>
  addReminder(input: NewReminder): Promise<Reminder>
  toggleReminder(id: string, done: boolean): Promise<Reminder>
  deleteReminder(id: string): Promise<void>
}
