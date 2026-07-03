import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Activity,
  ActivityType,
  AppUser,
  AttendanceStatus,
  Contact,
  ContactLink,
  ContactLinkKind,
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
  ContactPatch,
  NewActivity,
  NewContact,
  NewContactLink,
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
  'linkedin_verified_by, linkedin_verified_at, sentiment, sentiment_history, cadence_days, active_devices, ' +
  'won_customers_count, free_text, created_at, updated_at, ' +
  'side_facts(id,label,category), ' +
  'contact_photos(id,url,caption), ' +
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
  cadence_days: number | null
  active_devices: string | null
  won_customers_count: number
  free_text: string | null
  created_at: string
  updated_at: string
  side_facts?: { id: string; label: string; category: string | null }[] | null
  contact_photos?: { id: string; url: string; caption: string | null }[] | null
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
      verifiedById: row.linkedin_verified_by ?? undefined,
      verifiedByName: resolveName(row.linkedin_verified_by),
      verifiedAt: row.linkedin_verified_at ?? undefined,
    },
    sentiment: row.sentiment,
    sentimentHistory: row.sentiment_history ?? undefined,
    cadenceDays: row.cadence_days ?? undefined,
    activeDevices: row.active_devices ?? undefined,
    wonCustomersCount: row.won_customers_count ?? 0,
    freeText: row.free_text ?? undefined,
    sideFacts: (row.side_facts ?? []).map((f) => ({
      id: f.id,
      label: f.label,
      category: (f.category ?? 'other') as SideFact['category'],
    })),
    gallery: (row.contact_photos ?? []).map((p) => ({
      id: p.id,
      url: p.url,
      caption: p.caption ?? undefined,
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

/**
 * Pure mapper: ContactPatch -> DB column patch. Exhaustive over ContactPatch:
 * the switch narrows `key` to never, so adding a field to ContactPatch without
 * mapping it here is a compile error (the drift that once lost edits silently).
 * Key present + undefined clears the column (null); required-ish columns
 * (fullName, regionId, …) are skipped on undefined instead of nulled.
 */
export function patchToRow(patch: ContactPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const key of Object.keys(patch) as (keyof ContactPatch)[]) {
    switch (key) {
      case 'fullName':
        if (patch.fullName !== undefined) row.full_name = patch.fullName
        break
      case 'position':
        if (patch.position !== undefined) row.position = patch.position
        break
      case 'regionId':
        if (patch.regionId !== undefined) row.region_id = patch.regionId
        break
      case 'relationshipManagerId':
        if (patch.relationshipManagerId !== undefined)
          row.relationship_manager_id = patch.relationshipManagerId
        break
      case 'sentiment':
        if (patch.sentiment !== undefined) row.sentiment = patch.sentiment
        break
      case 'wonCustomersCount':
        if (patch.wonCustomersCount !== undefined) row.won_customers_count = patch.wonCustomersCount
        break
      case 'team':
        row.team = patch.team ?? null
        break
      case 'email':
        row.email = patch.email ?? null
        break
      case 'birthday':
        row.birthday = patch.birthday ?? null
        break
      case 'location':
        row.location = patch.location ?? null
        break
      case 'familyStatus':
        row.family_status = patch.familyStatus ?? null
        break
      case 'children':
        row.children = patch.children ?? null
        break
      case 'pets':
        row.pets = patch.pets ?? null
        break
      case 'activeDevices':
        row.active_devices = patch.activeDevices ?? null
        break
      case 'freeText':
        row.free_text = patch.freeText ?? null
        break
      case 'photoUrl':
        row.photo_url = patch.photoUrl ?? null
        break
      case 'sentimentHistory':
        row.sentiment_history = patch.sentimentHistory ?? null
        break
      case 'cadenceDays':
        row.cadence_days = patch.cadenceDays ?? null
        break
      case 'linkedin': {
        const li = patch.linkedin
        if (li !== undefined) {
          row.linkedin_status = li.status
          row.linkedin_url = li.url ?? null
          row.linkedin_verified_by = li.verifiedById ?? null
          row.linkedin_verified_at = li.verifiedAt ?? null
        }
        break
      }
      case 'sideFacts':
      case 'gallery':
        // Relation rows, not columns — persisted separately in updateContact.
        break
      default: {
        const unmapped: never = key
        void unmapped
      }
    }
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
        linkedin_verified_by: input.linkedin?.verifiedById ?? null,
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

  async updateContact(id: string, patch: ContactPatch): Promise<Contact> {
    const row = patchToRow(patch)
    if (Object.keys(row).length > 0) {
      const { error } = await this.client.from('contacts').update(row).eq('id', id)
      if (error) throw new Error(error.message)
    }

    // Side facts are replaced wholesale (small rows, client-generated ids).
    if (patch.sideFacts !== undefined) {
      const { error: delErr } = await this.client.from('side_facts').delete().eq('contact_id', id)
      if (delErr) throw new Error(delErr.message)
      if (patch.sideFacts.length > 0) {
        const { error: insErr } = await this.client
          .from('side_facts')
          .insert(patch.sideFacts.map((f) => ({ contact_id: id, label: f.label, category: f.category })))
        if (insErr) throw new Error(insErr.message)
      }
    }

    // Gallery is diffed by id so existing (potentially large) photo rows are
    // never re-uploaded: rows missing from the patch are deleted, entries with
    // unknown ids are inserted (the DB assigns their real ids).
    if (patch.gallery !== undefined) {
      const { data: existing, error: exErr } = await this.client
        .from('contact_photos')
        .select('id')
        .eq('contact_id', id)
      if (exErr) throw new Error(exErr.message)
      const existingIds = new Set(((existing ?? []) as { id: string }[]).map((r) => r.id))
      const keptIds = new Set(patch.gallery.map((p) => p.id))
      const removed = [...existingIds].filter((x) => !keptIds.has(x))
      if (removed.length > 0) {
        const { error: delErr } = await this.client.from('contact_photos').delete().in('id', removed)
        if (delErr) throw new Error(delErr.message)
      }
      const added = patch.gallery.filter((p) => !existingIds.has(p.id))
      if (added.length > 0) {
        const { error: insErr } = await this.client
          .from('contact_photos')
          .insert(added.map((p) => ({ contact_id: id, url: p.url, caption: p.caption ?? null })))
        if (insErr) throw new Error(insErr.message)
      }
    }

    const updated = await this.getContact(id)
    if (!updated) throw new Error(`contact ${id} not found after update`)
    return updated
  }

  async deleteContact(id: string): Promise<void> {
    // Dependent rows (side_facts, activities, photos, reminders, attendance)
    // are removed by the schema's ON DELETE CASCADE.
    const { error } = await this.client.from('contacts').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async listContactLinks(contactId: string): Promise<ContactLink[]> {
    const { data, error } = await this.client
      .from('contact_links')
      .select('id, from_contact_id, to_contact_id, kind, note')
      .or(`from_contact_id.eq.${contactId},to_contact_id.eq.${contactId}`)
    if (error) throw new Error(error.message)
    return (
      (data ?? []) as unknown as {
        id: string
        from_contact_id: string
        to_contact_id: string
        kind: ContactLinkKind
        note: string | null
      }[]
    ).map((r) => ({
      id: r.id,
      fromContactId: r.from_contact_id,
      toContactId: r.to_contact_id,
      kind: r.kind,
      note: r.note ?? undefined,
    }))
  }

  async addContactLink(input: NewContactLink): Promise<ContactLink> {
    const { data, error } = await this.client
      .from('contact_links')
      .insert({
        from_contact_id: input.fromContactId,
        to_contact_id: input.toContactId,
        kind: input.kind,
        note: input.note ?? null,
      })
      .select('id, from_contact_id, to_contact_id, kind, note')
      .single()
    if (error) throw new Error(error.message)
    const r = data as unknown as {
      id: string
      from_contact_id: string
      to_contact_id: string
      kind: ContactLinkKind
      note: string | null
    }
    return {
      id: r.id,
      fromContactId: r.from_contact_id,
      toContactId: r.to_contact_id,
      kind: r.kind,
      note: r.note ?? undefined,
    }
  }

  async deleteContactLink(id: string): Promise<void> {
    const { error } = await this.client.from('contact_links').delete().eq('id', id)
    if (error) throw new Error(error.message)
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
