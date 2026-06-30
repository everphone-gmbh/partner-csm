import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Activity,
  ActivityType,
  AppUser,
  Contact,
  LinkedInStatus,
  Region,
  Role,
  SideFact,
  TrafficLight,
} from '@/domain/types'
import { localSummarizer } from '@/domain/ai'
import type { NewActivity, NewContact, Repository } from './repository'

// ⚠ PRE-BUILT, NOT YET INTEGRATION-TESTED against the live DB.
// Blocked on applying the migrations (the SQL executor 404s for this tenant).
// The pure mappers below are unit-tested; the query wiring needs a live verify.

type NameResolver = (id?: string | null) => string | undefined

const CONTACT_SELECT =
  'id, full_name, position, photo_url, region_id, relationship_manager_id, email, ' +
  'birthday, location, family_status, children, pets, linkedin_status, linkedin_url, ' +
  'linkedin_verified_by, linkedin_verified_at, sentiment, active_devices, ' +
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
  if (patch.photoUrl !== undefined) row.photo_url = patch.photoUrl
  if (patch.freeText !== undefined) row.free_text = patch.freeText
  if (patch.linkedin !== undefined) {
    row.linkedin_status = patch.linkedin.status
    row.linkedin_url = patch.linkedin.url ?? null
    row.linkedin_verified_at = patch.linkedin.verifiedAt ?? null
  }
  return row
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
}
