import type { Activity, AppUser, Contact, Region } from '@/domain/types'

export interface NewActivity {
  contactId: string
  type: Activity['type']
  occurredAt: string
  authorId: string
  authorName: string
  body: string
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
  updateContact(id: string, patch: Partial<Contact>): Promise<Contact>
  listActivities(contactId: string): Promise<Activity[]>
  addActivity(input: NewActivity): Promise<Activity>
}
