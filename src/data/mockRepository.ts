import type { Activity, AttendanceStatus, Contact, EventItem } from '@/domain/types'
import { localSummarizer } from '@/domain/ai'
import type { NewActivity, NewContact, NewEvent, Repository } from './repository'
import {
  seedActivities,
  seedContacts,
  seedEventAttendees,
  seedEvents,
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
  private seq = 1

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
      email: input.email,
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
    return clone(contact)
  }

  async updateContact(id: string, patch: Partial<Contact>) {
    const idx = this.contacts.findIndex((c) => c.id === id)
    if (idx < 0) throw new Error(`contact ${id} not found`)
    this.contacts[idx] = { ...this.contacts[idx], ...patch, updatedAt: nowIso() }
    return clone(this.contacts[idx])
  }

  async listActivities(contactId: string) {
    const items = this.activities
      .filter((a) => a.contactId === contactId)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
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
      location: input.location,
      description: input.description,
    }
    this.events.push(event)
    return clone(event)
  }

  async listEventAttendees(eventId: string) {
    return this.attendees
      .filter((a) => a.eventId === eventId)
      .map((a) => ({ contactId: a.contactId, status: a.status, purpose: a.purpose }))
  }

  async setAttendee(
    eventId: string,
    contactId: string,
    patch: { status?: AttendanceStatus; purpose?: string },
  ) {
    let rec = this.attendees.find((a) => a.eventId === eventId && a.contactId === contactId)
    if (!rec) {
      rec = { eventId, contactId, status: patch.status ?? 'invited', purpose: patch.purpose }
      this.attendees.push(rec)
    } else {
      if (patch.status !== undefined) rec.status = patch.status
      if (patch.purpose !== undefined) rec.purpose = patch.purpose
    }
    return { contactId: rec.contactId, status: rec.status, purpose: rec.purpose }
  }

  async removeAttendee(eventId: string, contactId: string) {
    this.attendees = this.attendees.filter(
      (a) => !(a.eventId === eventId && a.contactId === contactId),
    )
  }
}

/** Singleton in-memory repo backing the first-draft UI. */
export const mockRepository: Repository = new MockRepository()
