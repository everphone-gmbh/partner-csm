import type { Activity, AppUser, Contact, LinkedInInfo, Region, SideFact } from '@/domain/types'

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
}
