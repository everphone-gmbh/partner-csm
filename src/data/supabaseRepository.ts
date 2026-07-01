import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Activity,
  ActivityType,
  AppUser,
  AttendanceStatus,
  Contact,
  EventAttendee,
  EventItem,
  EventNote,
  LinkedInStatus,
  NoteAttachment,
  Region,
  Reminder,
  Role,
  SentimentEntry,
  SideFact,
  TrafficLight,
} from '@/domain/types'
import { localSummarizer } from '@/domain/ai'
import type {
  NewActivity,
  NewContact,
  NewEvent,
  NewEventNote,
  NewReminder,
  Repository,
} from './repository'

// ⚠ PRE-BUILT, NOT YET INTEGRATION-TESTED against the live DB.
// Blocked on applying the migrations (the SQL executor 404s for this tenant).
// The pure mappers below are unit-tested; the query wiring needs a live verify.

type NameResolver = (id?: string | null) => string | undefined

const CONTACT_SELECT =
  'id, full_name, position, photo_url, region_id, relationship_manager_id, team, email, ' +
  'birthday, location, family_status, children, pets, linkedin_status, linkedin_url, ' +
  'linkedin_verified_by, linkedin_verified_at, sentiment, sentiment_history, active_devices, ' +
  'won_customers_count, free_text, created_at, updated_at, ' +
  'side_facts(id,label,category), ' +
  'contact_customers(with_us, customers(id,name,salesforce_url))'

export interface ContactRow {
  id: string
  full_name: string
  position: string | null
  photo_url: string | null
  region_id: string
  relationship_manager_id: string | null
  team: string | null
  email: string | null
  birthday: string | null
  location: string | null
  family_status: string | null
  children: string | null
  pets: string | null
  linkedin_status: LinkedInStatus
  linkedin_url: string | null
  linkedin_verified_by: string | null
  linkedin_verified_at: string | null
  sentiment: TrafficLight
  sentiment_history: SentimentEntry[] | null
  active_devices: string | null
  won_customers_count: number
  free_text: string | null
  created_at: string
  updated_at: string
  side_facts?: { id: string; label: string; category: string | null }[] | null
  contact_customers?:
    | { with_us: boolean; customers: { id: string; name: string; salesforce_url: string | null } | null }[]
    | null
}

export interface ActivityRow {
  id: string
  contact_id: string
  type: ActivityType
  occurred_at: string
  author_id: string
  body: string | null
  ai_summary: string | null
}

/** Pure mapper: DB contact row -> domain Contact. Unit-tested. */
export function mapRowToContact(row: ContactRow, resolveName: NameResolver = () => undefined): Contact {
  return {
    id: row.id,
    fullName: row.full_name,
    position: row.position ?? '',
    photoUrl: row.photo_url,
    regionId: row.region_id,
    relationshipManagerId: row.relationship_manager_id ?? '',
    team: row.team ?? undefined,
    email: row.email ?? undefined,
    birthday: row.birthday ?? undefined,
    location: row.location ?? undefined,
    familyStatus: row.family_status ?? undefined,
    children: row.children ?? undefined,
    pets: row.pets ?? undefined,
    linkedin: {
      status: row.linkedin_status,
      url: row.linkedin_url ?? undefined,
      verifiedByName: resolveName(row.linkedin_verified_by),
      verifiedAt: row.linkedin_verified_at ?? undefined,
    },
    sentiment: row.sentiment,
    sentimentHistory: row.sentiment_history ?? undefined,
    activeDevices: row.active_devices ?? undefined,
    wonCustomersCount: row.won_customers_count ?? 0,
    freeText: row.free_text ?? undefined,
    sideFacts: (row.side_facts ?? []).map((f) => ({
      id: f.id,
      label: f.label,
      category: (f.category ?? 'other') as SideFact['category'],
    })),
    customers: (row.contact_customers ?? [])
      .filter((cc) => cc.customers)
      .map((cc) => ({
        id: cc.customers!.id,
        name: cc.customers!.name,
        withUs: cc.with_us,
        salesforceUrl: cc.customers!.salesforce_url ?? undefined,
      })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Pure mapper: DB activity row -> domain Activity. Unit-tested. */
export function mapRowToActivity(row: ActivityRow, resolveName: NameResolver = () => undefined): Activity {
  return {
    id: row.id,
    contactId: row.contact_id,
    type: row.type,
    occurredAt: row.occurred_at,
    authorId: row.author_id,
    authorName: resolveName(row.author_id) ?? 'Unbekannt',
    body: row.body ?? '',
    aiSummary: row.ai_summary ?? undefined,
    attachments: [],
  }
}

/** Pure mapper: domain Contact patch -> DB column patch (only editable fields). */
export function patchToRow(patch: Partial<Contact>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (patch.sentiment !== undefined) row.sentiment = patch.sentiment
  if (patch.sentimentHistory !== undefined) row.sentiment_history = patch.sentimentHistory
  if (patch.team !== undefined) row.team = patch.team
  if (patch.photoUrl !== undefined) row.photo_url = patch.photoUrl
  if (patch.freeText !== undefined) row.free_text = patch.freeText
  if (patch.linkedin !== undefined) {
    row.linkedin_status = patch.linkedin.status
    row.linkedin_url = patch.linkedin.url ?? null
    row.linkedin_verified_at = patch.linkedin.verifiedAt ?? null
  }
  return row
}

export interface EventRow {
  id: string
  name: string
  event_date: string
  location: string | null
  description: string | null
}

export function mapRowToEvent(row: EventRow): EventItem {
  return {
    id: row.id,
    name: row.name,
    date: row.event_date,
    location: row.location ?? undefined,
    description: row.description ?? undefined,
  }
}

export interface ReminderRow {
  id: string
  contact_id: string
  due_date: string
  text: string
  done: boolean
  created_by_name: string
}

export function mapRowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    contactId: row.contact_id,
    dueDate: row.due_date,
    text: row.text,
    done: row.done,
    createdByName: row.created_by_name,
  }
}

export interface EventNoteRow {
  id: string
  event_id: string
  text: string
  author_name: string
  attachments: NoteAttachment[] | null
  created_at: string
}

export function mapRowToEventNote(row: EventNoteRow): EventNote {
  return {
    id: row.id,
    eventId: row.event_id,
    text: row.text,
    authorName: row.author_name,
    createdAt: row.created_at,
    attachments: row.attachments ?? [],
  }
}

export class SupabaseRepository implements Repository {
  private client: SupabaseClient
  private namesPromise?: Promise<Map<string, string>>

  constructor(client: SupabaseClient) {
    this.client = client
  }

  private async loadNames(): Promise<Map<string, string>> {
    const { data } = await this.client.from('profiles').select('id, full_name')
    const map = new Map<string, string>()
    for (const r of (data ?? []) as { id: string; full_name: string }[]) {
      map.set(r.id, r.full_name)
    }
    return map
  }

  /** Cached id -> full_name lookup for attribution and LinkedIn verifier names. */
  private names(): Promise<Map<string, string>> {
    return this.namesPromise ?? (this.namesPromise = this.loadNames())
  }

  private resolver(names: Map<string, string>): NameResolver {
    return (id) => (id ? names.get(id) : undefined)
  }

  async listRegions(): Promise<Region[]> {
    const { data, error } = await this.client.from('regions').select('id, name').order('name')
    if (error) throw new Error(error.message)
    return (data ?? []) as Region[]
  }

  async listUsers(): Promise<AppUser[]> {
    const { data, error } = await this.client.from('profiles').select('id, full_name, role, region_id')
    if (error) throw new Error(error.message)
    return ((data ?? []) as { id: string; full_name: string; role: Role; region_id: string | null }[]).map(
      (r) => ({ id: r.id, name: r.full_name, role: r.role, regionId: r.region_id ?? undefined }),
    )
  }

  async listContacts(): Promise<Contact[]> {
    const [{ data, error }, names] = await Promise.all([
      this.client.from('contacts').select(CONTACT_SELECT).order('full_name'),
      this.names(),
    ])
    if (error) throw new Error(error.message)
    const resolve = this.resolver(names)
    return ((data ?? []) as unknown as ContactRow[]).map((row) => mapRowToContact(row, resolve))
  }

  async getContact(id: string): Promise<Contact | undefined> {
    const [{ data, error }, names] = await Promise.all([
      this.client.from('contacts').select(CONTACT_SELECT).eq('id', id).maybeSingle(),
      this.names(),
    ])
    if (error) throw new Error(error.message)
    if (!data) return undefined
    return mapRowToContact(data as unknown as ContactRow, this.resolver(names))
  }

  async createContact(input: NewContact): Promise<Contact> {
    const { data, error } = await this.client
      .from('contacts')
      .insert({
        full_name: input.fullName,
        position: input.position,
        region_id: input.regionId,
        relationship_manager_id: input.relationshipManagerId,
        team: input.team ?? null,
        email: input.email ?? null,
        birthday: input.birthday ?? null,
        location: input.location ?? null,
        family_status: input.familyStatus ?? null,
        children: input.children ?? null,
        pets: input.pets ?? null,
        active_devices: input.activeDevices ?? null,
        won_customers_count: input.wonCustomersCount ?? 0,
        free_text: input.freeText ?? null,
        linkedin_status: input.linkedin?.status ?? 'unknown',
        linkedin_url: input.linkedin?.url ?? null,
        linkedin_verified_at: input.linkedin?.verifiedAt ?? null,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    const id = (data as { id: string }).id
    if (input.sideFacts?.length) {
      const { error: sfErr } = await this.client
        .from('side_facts')
        .insert(input.sideFacts.map((f) => ({ contact_id: id, label: f.label, category: f.category })))
      if (sfErr) throw new Error(sfErr.message)
    }
    const created = await this.getContact(id)
    if (!created) throw new Error('created contact not found after insert')
    return created
  }

  async updateContact(id: string, patch: Partial<Contact>): Promise<Contact> {
    const [{ data, error }, names] = await Promise.all([
      this.client.from('contacts').update(patchToRow(patch)).eq('id', id).select(CONTACT_SELECT).single(),
      this.names(),
    ])
    if (error) throw new Error(error.message)
    return mapRowToContact(data as unknown as ContactRow, this.resolver(names))
  }

  async listActivities(contactId: string): Promise<Activity[]> {
    const [{ data, error }, names] = await Promise.all([
      this.client
        .from('activities')
        .select('id, contact_id, type, occurred_at, author_id, body, ai_summary')
        .eq('contact_id', contactId)
        .order('occurred_at', { ascending: false }),
      this.names(),
    ])
    if (error) throw new Error(error.message)
    const resolve = this.resolver(names)
    return ((data ?? []) as unknown as ActivityRow[]).map((row) => mapRowToActivity(row, resolve))
  }

  async addActivity(input: NewActivity): Promise<Activity> {
    const { data, error } = await this.client
      .from('activities')
      .insert({
        contact_id: input.contactId,
        type: input.type,
        occurred_at: input.occurredAt,
        author_id: input.authorId,
        body: input.body,
        ai_summary: localSummarizer.activitySummary(input),
      })
      .select('id, contact_id, type, occurred_at, author_id, body, ai_summary')
      .single()
    if (error) throw new Error(error.message)
    const names = await this.names()
    return mapRowToActivity(data as unknown as ActivityRow, this.resolver(names))
  }

  async listAllActivities(): Promise<Activity[]> {
    const [{ data, error }, names] = await Promise.all([
      this.client
        .from('activities')
        .select('id, contact_id, type, occurred_at, author_id, body, ai_summary')
        .order('occurred_at', { ascending: false }),
      this.names(),
    ])
    if (error) throw new Error(error.message)
    const resolve = this.resolver(names)
    return ((data ?? []) as unknown as ActivityRow[]).map((row) => mapRowToActivity(row, resolve))
  }

  async listEvents(): Promise<EventItem[]> {
    const { data, error } = await this.client
      .from('events')
      .select('id, name, event_date, location, description')
      .order('event_date')
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as EventRow[]).map(mapRowToEvent)
  }

  async getEvent(id: string): Promise<EventItem | undefined> {
    const { data, error } = await this.client
      .from('events')
      .select('id, name, event_date, location, description')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? mapRowToEvent(data as unknown as EventRow) : undefined
  }

  async createEvent(input: NewEvent): Promise<EventItem> {
    const { data, error } = await this.client
      .from('events')
      .insert({
        name: input.name,
        event_date: input.date,
        location: input.location ?? null,
        description: input.description ?? null,
      })
      .select('id, name, event_date, location, description')
      .single()
    if (error) throw new Error(error.message)
    return mapRowToEvent(data as unknown as EventRow)
  }

  async listEventAttendees(eventId: string): Promise<EventAttendee[]> {
    const { data, error } = await this.client
      .from('event_attendees')
      .select('contact_id, status, purpose')
      .eq('event_id', eventId)
    if (error) throw new Error(error.message)
    return (
      (data ?? []) as unknown as { contact_id: string; status: AttendanceStatus; purpose: string | null }[]
    ).map((r) => ({ contactId: r.contact_id, status: r.status, purpose: r.purpose ?? undefined }))
  }

  async setAttendee(
    eventId: string,
    contactId: string,
    patch: { status?: AttendanceStatus; purpose?: string },
  ): Promise<EventAttendee> {
    const row: Record<string, unknown> = { event_id: eventId, contact_id: contactId }
    if (patch.status !== undefined) row.status = patch.status
    if (patch.purpose !== undefined) row.purpose = patch.purpose
    const { data, error } = await this.client
      .from('event_attendees')
      .upsert(row, { onConflict: 'event_id,contact_id' })
      .select('contact_id, status, purpose')
      .single()
    if (error) throw new Error(error.message)
    const r = data as unknown as { contact_id: string; status: AttendanceStatus; purpose: string | null }
    return { contactId: r.contact_id, status: r.status, purpose: r.purpose ?? undefined }
  }

  async removeAttendee(eventId: string, contactId: string): Promise<void> {
    const { error } = await this.client
      .from('event_attendees')
      .delete()
      .eq('event_id', eventId)
      .eq('contact_id', contactId)
    if (error) throw new Error(error.message)
  }

  async listReminders(contactId?: string): Promise<Reminder[]> {
    const base = this.client
      .from('reminders')
      .select('id, contact_id, due_date, text, done, created_by_name')
      .order('due_date')
    const { data, error } = await (contactId ? base.eq('contact_id', contactId) : base)
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as ReminderRow[]).map(mapRowToReminder)
  }

  async addReminder(input: NewReminder): Promise<Reminder> {
    const { data, error } = await this.client
      .from('reminders')
      .insert({
        contact_id: input.contactId,
        due_date: input.dueDate,
        text: input.text,
        created_by_name: input.createdByName,
        done: false,
      })
      .select('id, contact_id, due_date, text, done, created_by_name')
      .single()
    if (error) throw new Error(error.message)
    return mapRowToReminder(data as unknown as ReminderRow)
  }

  async toggleReminder(id: string, done: boolean): Promise<Reminder> {
    const { data, error } = await this.client
      .from('reminders')
      .update({ done })
      .eq('id', id)
      .select('id, contact_id, due_date, text, done, created_by_name')
      .single()
    if (error) throw new Error(error.message)
    return mapRowToReminder(data as unknown as ReminderRow)
  }

  async deleteReminder(id: string): Promise<void> {
    const { error } = await this.client.from('reminders').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async listEventNotes(eventId: string): Promise<EventNote[]> {
    const { data, error } = await this.client
      .from('event_notes')
      .select('id, event_id, text, author_name, attachments, created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as EventNoteRow[]).map(mapRowToEventNote)
  }

  async addEventNote(input: NewEventNote): Promise<EventNote> {
    const { data, error } = await this.client
      .from('event_notes')
      .insert({
        event_id: input.eventId,
        text: input.text,
        author_name: input.authorName,
        attachments: input.attachments,
      })
      .select('id, event_id, text, author_name, attachments, created_at')
      .single()
    if (error) throw new Error(error.message)
    return mapRowToEventNote(data as unknown as EventNoteRow)
  }
}
