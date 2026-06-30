import type { Activity, Contact } from '@/domain/types'
import { localSummarizer } from '@/domain/ai'
import type { NewActivity, NewContact, Repository } from './repository'
import { seedActivities, seedContacts, seedRegions, seedUsers } from './seed'

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
}

/** Singleton in-memory repo backing the first-draft UI. */
export const mockRepository: Repository = new MockRepository()
