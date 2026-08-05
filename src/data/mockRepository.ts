import type {
  Activity,
  AuditEntry,
  Contact,
  ContactLink,
  EventItem,
  EventNote,
  IntroRequest,
  OrgUnit,
  Reminder,
} from '@/domain/types'
import { localSummarizer } from '@/domain/ai'
import {
  indexAccountsByName,
  matchAccount,
  type EverphoneAccount,
} from '@/domain/everphoneAccounts'
import { seedEverphoneAccounts } from './seed'
import type {
  AttendeePatch,
  BulkAssignPatch,
  ContactPatch,
  NewActivity,
  NewContact,
  NewContactLink,
  NewEvent,
  NewEventNote,
  NewIntroRequest,
  NewReminder,
  Repository,
} from './repository'
import {
  seedActivities,
  seedContactLinks,
  seedIntroRequests,
  seedContacts,
  seedEventAttendees,
  seedEventNotes,
  seedEvents,
  seedReminders,
  seedOrgUnits,
  seedRegions,
  seedUsers,
} from './seed'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function nowIso(): string {
  return new Date().toISOString()
}

class MockRepository implements Repository {
  private regions = clone(seedRegions)
  private users = clone(seedUsers)
  private contacts = clone(seedContacts)
  private activities = clone(seedActivities)
  private events = clone(seedEvents)
  private attendees = clone(seedEventAttendees)
  private eventNotes = clone(seedEventNotes)
  private reminders = clone(seedReminders)
  private links = clone(seedContactLinks)
  private introRequests = clone(seedIntroRequests)
  private orgUnits: OrgUnit[] = clone(seedOrgUnits)
  private seq = 1
  // Im Mock von Hand geführt; produktiv schreiben DB-Trigger (Migration 0019).
  private auditLog: AuditEntry[] = []
  private auditSeq = 1

  private audit(action: AuditEntry['action'], entity: string, entityId: string, fields?: string[]) {
    this.auditLog.unshift({
      id: this.auditSeq++,
      at: nowIso(),
      action,
      entity,
      entityId,
      actorName: 'Demo-Nutzer',
      fields,
    })
  }

  async listRegions() {
    return clone(this.regions)
  }

  async listUsers() {
    return clone(this.users)
  }

  async listContacts() {
    return clone(this.contacts)
  }

  async getContact(id: string) {
    const found = this.contacts.find((c) => c.id === id)
    return found ? clone(found) : undefined
  }

  async createContact(input: NewContact) {
    const now = nowIso()
    const contact: Contact = {
      id: `c-local-${this.seq++}`,
      fullName: input.fullName,
      position: input.position,
      photoUrl: null,
      regionId: input.regionId,
      relationshipManagerId: input.relationshipManagerId,
      company: input.company,
      team: input.team,
      email: input.email,
      phoneWork: input.phoneWork,
      phoneMobile: input.phoneMobile,
      phonePrivate: input.phonePrivate,
      birthday: input.birthday,
      location: input.location,
      familyStatus: input.familyStatus,
      children: input.children,
      pets: input.pets,
      linkedin: input.linkedin ?? { status: 'unknown' },
      sentiment: 'neutral',
      activeDevices: input.activeDevices,
      wonCustomersCount: input.wonCustomersCount ?? 0,
      freeText: input.freeText,
      sideFacts: input.sideFacts ?? [],
      customers: [],
      createdAt: now,
      updatedAt: now,
    }
    this.contacts.push(contact)
    this.audit('insert', 'contact', contact.id)
    return clone(contact)
  }

  async updateContact(id: string, patch: ContactPatch) {
    const idx = this.contacts.findIndex((c) => c.id === id)
    if (idx < 0) throw new Error(`contact ${id} not found`)
    const before = this.contacts[idx]
    const fields = (Object.keys(patch) as (keyof ContactPatch)[]).filter(
      (k) => JSON.stringify(patch[k]) !== JSON.stringify(before[k as keyof Contact]),
    )
    this.contacts[idx] = { ...before, ...patch, updatedAt: nowIso() }
    if (fields.length > 0) this.audit('update', 'contact', id, fields as string[])
    return clone(this.contacts[idx])
  }

  async deleteContact(id: string) {
    if (this.contacts.some((c) => c.id === id)) this.audit('delete', 'contact', id)
    // Mirror the DB's ON DELETE CASCADE: dependent personal data goes too.
    this.contacts = this.contacts.filter((c) => c.id !== id)
    this.activities = this.activities.filter((a) => a.contactId !== id)
    this.reminders = this.reminders.filter((r) => r.contactId !== id)
    this.attendees = this.attendees.filter((a) => a.contactId !== id)
    this.links = this.links.filter((l) => l.fromContactId !== id && l.toContactId !== id)
    this.eventNotes = this.eventNotes.filter((n) => n.contactId !== id)
  }

  async reassignContacts(fromUserId: string, toUserId: string) {
    let moved = 0
    this.contacts = this.contacts.map((c) => {
      if (c.relationshipManagerId !== fromUserId) return c
      moved++
      return { ...c, relationshipManagerId: toUserId, updatedAt: nowIso() }
    })
    return moved
  }

  async bulkAssign(contactIds: string[], patch: BulkAssignPatch) {
    // Ohne Feld gibt es kein UPDATE — der Supabase-Adapter kehrt hier ebenfalls
    // früh zurück, sonst weichen die Rückgabewerte voneinander ab.
    if (patch.regionId === undefined && patch.relationshipManagerId === undefined) return 0
    const wanted = new Set(contactIds)
    let matched = 0
    this.contacts = this.contacts.map((c) => {
      if (!wanted.has(c.id)) return c
      // Getroffen zählt, nicht geändert: Postgres gibt bei
      // `update … in (…) returning id` auch Zeilen zurück, deren Wert schon
      // stimmte. Beide Adapter müssen dieselbe Zahl liefern.
      matched++
      const next = { ...c }
      const fields: string[] = []
      if (patch.regionId !== undefined && patch.regionId !== c.regionId) {
        next.regionId = patch.regionId
        fields.push('region_id')
      }
      if (
        patch.relationshipManagerId !== undefined &&
        patch.relationshipManagerId !== c.relationshipManagerId
      ) {
        next.relationshipManagerId = patch.relationshipManagerId
        fields.push('relationship_manager_id')
      }
      if (fields.length === 0) return c
      next.updatedAt = nowIso()
      // Produktiv schreibt der DB-Trigger je Zeile einen Eintrag und lässt
      // wertgleiche Updates aus (0019).
      this.audit('update', 'contact', c.id, fields)
      return next
    })
    return matched
  }

  async listContactLinks(contactId: string) {
    return clone(
      this.links.filter((l) => l.fromContactId === contactId || l.toContactId === contactId),
    )
  }

  async listAllContactLinks() {
    return clone(this.links)
  }

  async addContactLink(input: NewContactLink) {
    const link: ContactLink = {
      id: `link-local-${this.seq++}`,
      fromContactId: input.fromContactId,
      toContactId: input.toContactId,
      kind: input.kind,
      note: input.note,
    }
    this.links.push(link)
    return clone(link)
  }

  async deleteContactLink(id: string) {
    this.links = this.links.filter((l) => l.id !== id)
  }

  async listActivities(contactId: string) {
    const items = this.activities
      .filter((a) => a.contactId === contactId)
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    return clone(items)
  }

  async addActivity(input: NewActivity) {
    const activity: Activity = {
      id: `act-local-${this.seq++}`,
      contactId: input.contactId,
      type: input.type,
      occurredAt: input.occurredAt,
      authorId: input.authorId,
      authorName: input.authorName,
      body: input.body,
      aiSummary: localSummarizer.activitySummary(input),
      attachments: [],
    }
    this.activities.push(activity)
    return clone(activity)
  }

  async listAllActivities() {
    return clone(this.activities)
  }

  async listIntroRequests() {
    return clone(
      [...this.introRequests].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    )
  }

  async addIntroRequest(input: NewIntroRequest) {
    const req: IntroRequest = {
      id: `intro-local-${this.seq++}`,
      text: input.text,
      createdById: input.createdById,
      createdByName: input.createdByName,
      createdAt: nowIso(),
      status: 'open',
    }
    this.introRequests.push(req)
    return clone(req)
  }

  async resolveIntroRequest(id: string, helperName: string) {
    const idx = this.introRequests.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error(`intro request ${id} not found`)
    this.introRequests[idx] = {
      ...this.introRequests[idx],
      status: 'resolved',
      helperName,
      resolvedAt: nowIso(),
    }
    return clone(this.introRequests[idx])
  }

  async deleteIntroRequest(id: string) {
    this.introRequests = this.introRequests.filter((r) => r.id !== id)
  }

  async listEvents() {
    return clone(this.events)
  }

  async getEvent(id: string) {
    const found = this.events.find((e) => e.id === id)
    return found ? clone(found) : undefined
  }

  async createEvent(input: NewEvent) {
    const event: EventItem = {
      id: `ev-local-${this.seq++}`,
      name: input.name,
      date: input.date,
      endDate: input.endDate,
      location: input.location,
      description: input.description,
    }
    this.events.push(event)
    return clone(event)
  }

  async listEventAttendees(eventId: string) {
    return clone(
      this.attendees
        .filter((a) => a.eventId === eventId)
        .map(({ eventId: _e, ...rest }) => rest),
    )
  }

  async setAttendee(eventId: string, contactId: string, patch: AttendeePatch) {
    let rec = this.attendees.find((a) => a.eventId === eventId && a.contactId === contactId)
    if (!rec) {
      rec = { eventId, contactId, status: patch.status ?? 'invited' }
      this.attendees.push(rec)
    }
    if (patch.status !== undefined) rec.status = patch.status
    if (patch.purpose !== undefined) rec.purpose = patch.purpose
    if (patch.slotAt !== undefined) {
      rec.slotAt = patch.slotAt ?? undefined
      // Dauer ohne Termin ist sinnlos (der DB-Check verbietet sie ebenfalls).
      if (patch.slotAt === null) rec.slotMinutes = undefined
    }
    if (patch.slotMinutes !== undefined) rec.slotMinutes = patch.slotMinutes ?? undefined
    if (patch.meetingPoint !== undefined) rec.meetingPoint = patch.meetingPoint ?? undefined
    const { eventId: _e, ...out } = rec
    return clone(out)
  }

  async removeAttendee(eventId: string, contactId: string) {
    this.attendees = this.attendees.filter(
      (a) => !(a.eventId === eventId && a.contactId === contactId),
    )
  }

  async listReminders(contactId?: string) {
    const items = contactId
      ? this.reminders.filter((r) => r.contactId === contactId)
      : this.reminders
    return clone(
      [...items].sort(
        (a, b) =>
          a.dueDate.localeCompare(b.dueDate) || (a.dueTime ?? '').localeCompare(b.dueTime ?? ''),
      ),
    )
  }

  async addReminder(input: NewReminder) {
    const reminder: Reminder = {
      id: `rem-local-${this.seq++}`,
      contactId: input.contactId,
      dueDate: input.dueDate,
      dueTime: input.dueTime,
      text: input.text,
      done: false,
      createdByName: input.createdByName,
    }
    this.reminders.push(reminder)
    return clone(reminder)
  }

  async toggleReminder(id: string, done: boolean) {
    const idx = this.reminders.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error(`reminder ${id} not found`)
    this.reminders[idx] = { ...this.reminders[idx], done }
    return clone(this.reminders[idx])
  }

  async deleteReminder(id: string) {
    this.reminders = this.reminders.filter((r) => r.id !== id)
  }

  async listAuditLog(limit = 100) {
    return clone(this.auditLog.slice(0, limit))
  }

  async listOrgUnits() {
    return clone(this.orgUnits)
  }

  async matchEverphoneAccounts(customerNames: string[]) {
    const index = indexAccountsByName(seedEverphoneAccounts)
    const hits = customerNames
      .map((name) => matchAccount(name, index))
      .filter((a): a is EverphoneAccount => Boolean(a))
    return clone([...new Map(hits.map((a) => [a.salesforceId, a])).values()])
  }

  async searchEverphoneAccounts(term: string, limit = 8) {
    const needle = term.trim().toLowerCase()
    if (needle.length < 2) return []
    return clone(
      seedEverphoneAccounts
        .filter((a) => a.name.toLowerCase().includes(needle))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .slice(0, limit),
    )
  }

  async listEventNotes(eventId: string) {
    return clone(
      this.eventNotes
        .filter((n) => n.eventId === eventId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    )
  }

  async addEventNote(input: NewEventNote) {
    const note: EventNote = {
      id: `en-local-${this.seq++}`,
      eventId: input.eventId,
      text: input.text,
      authorName: input.authorName,
      createdAt: nowIso(),
      attachments: input.attachments,
      contactId: input.contactId,
    }
    this.eventNotes.push(note)
    return clone(note)
  }
}

/** Singleton in-memory repo backing the first-draft UI. */
export const mockRepository: Repository = new MockRepository()

/** Fresh, isolated instance for tests (the contract suite needs a clean slate per test). */
export function createMockRepository(): Repository {
  return new MockRepository()
}
