import type {
  Activity,
  AppUser,
  AttendanceStatus,
  Contact,
  EventAttendee,
  EventItem,
  LinkedInInfo,
  Region,
  Reminder,
  SideFact,
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
  updateContact(id: string, patch: Partial<Contact>): Promise<Contact>
  listActivities(contactId: string): Promise<Activity[]>
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
  /** All reminders, or just those for one contact when contactId is given. */
  listReminders(contactId?: string): Promise<Reminder[]>
  addReminder(input: NewReminder): Promise<Reminder>
  toggleReminder(id: string, done: boolean): Promise<Reminder>
  deleteReminder(id: string): Promise<void>
}
