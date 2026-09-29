import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Activity,
  ActivityType,
  AppUser,
  AuditEntry,
  AttendanceStatus,
  BuyingRole,
  Contact,
  ContactLink,
  ContactLinkKind,
  EventAttendee,
  EventGuest,
  EventItem,
  EventNote,
  GiftOccasion,
  GiftOccasionKind,
  GiftProduct,
  GiftRecipient,
  GiftSender,
  GiftShipping,
  GiftStatus,
  HierarchyLevel,
  IntroRequest,
  IntroRequestStatus,
  LinkedInStatus,
  NoteAttachment,
  OrgUnit,
  PendingAccount,
  Region,
  Reminder,
  Role,
  SentimentEntry,
  SideFact,
  SocialLink,
  TrafficLight,
} from '@/domain/types'
import { localSummarizer } from '@/domain/ai'
import {
  classifyAccountType,
  normalizeCompanyName,
  type EverphoneAccount,
} from '@/domain/everphoneAccounts'
import type {
  AttendeePatch,
  BulkAssignPatch,
  ContactPatch,
  EventGuestPatch,
  GiftOccasionPatch,
  GiftProductPatch,
  GiftRecipientPatch,
  NewActivity,
  NewContact,
  NewContactLink,
  NewEvent,
  NewEventGuest,
  NewEventNote,
  NewGiftOccasion,
  NewGiftProduct,
  NewGiftRecipient,
  NewIntroRequest,
  NewReminder,
  Repository,
} from './repository'

// Live gegen die Sovereign-Cloud-Instanz seit 2026-07-16 (Migrationen 0001+).
// Die reinen Mapper sind unit-getestet, das Query-Wiring läuft zusätzlich in
// der Contract-Suite gegen einen Fake-Client (src/test/fakeSupabase.ts).

type NameResolver = (id?: string | null) => string | undefined

/**
 * Lesequellen sind die redaktierten Views (Migration 0018), nicht die
 * Basistabellen: der Server entscheidet, welche Felder ein Tier bekommt.
 * Schreibzugriffe gehen weiter direkt auf die Tabellen (privilegiert per RLS).
 */
const CONTACT_READ = 'contact_cards'
const ACTIVITY_READ = 'activity_cards'
/** Eine Stelle fuer die Spaltenliste — sonst vergisst ein Lesepfad ein neues Feld. */
const ACTIVITY_SELECT = 'id, contact_id, type, occurred_at, author_id, body, ai_summary, edited_at'

const CONTACT_SELECT =
  'id, full_name, position, photo_url, region_id, region_ids, relationship_manager_id, company, ' +
  'hierarchy_level, additional_companies, team, email, ' +
  'phone_work, phone_mobile, phone_private, ' +
  'phone_direct, email_private, business_address, assistant_name, assistant_contact, social_links, ' +
  'birthday, location, family_status, children, pets, linkedin_status, linkedin_url, ' +
  'linkedin_verified_by, linkedin_verified_at, sentiment, sentiment_history, cadence_days, buying_role, active_devices, ' +
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
  /** Alle Gebiete des Kontakts (View-Spalte seit 0035). */
  region_ids?: string[] | null
  relationship_manager_id: string | null
  company: string | null
  /** Organigramm (0039). */
  hierarchy_level?: HierarchyLevel | null
  additional_companies?: string[] | null
  team: string | null
  email: string | null
  phone_work: string | null
  phone_mobile: string | null
  phone_private: string | null
  phone_direct: string | null
  email_private: string | null
  business_address: string | null
  assistant_name: string | null
  assistant_contact: string | null
  social_links: SocialLink[] | null
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
  buying_role: BuyingRole | null
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
  /** Gesetzt, sobald der Text nachtraeglich korrigiert wurde (0034). */
  edited_at?: string | null
}

/** Pure mapper: DB contact row -> domain Contact. Unit-tested. */
export function mapRowToContact(row: ContactRow, resolveName: NameResolver = () => undefined): Contact {
  return {
    id: row.id,
    fullName: row.full_name,
    position: row.position ?? '',
    photoUrl: row.photo_url,
    regionId: row.region_id,
    regionIds: row.region_ids ?? undefined,
    relationshipManagerId: row.relationship_manager_id ?? '',
    company: row.company ?? undefined,
    hierarchyLevel: row.hierarchy_level ?? undefined,
    additionalCompanies: row.additional_companies?.length ? row.additional_companies : undefined,
    team: row.team ?? undefined,
    email: row.email ?? undefined,
    phoneWork: row.phone_work ?? undefined,
    phoneMobile: row.phone_mobile ?? undefined,
    phonePrivate: row.phone_private ?? undefined,
    phoneDirect: row.phone_direct ?? undefined,
    emailPrivate: row.email_private ?? undefined,
    businessAddress: row.business_address ?? undefined,
    assistantName: row.assistant_name ?? undefined,
    assistantContact: row.assistant_contact ?? undefined,
    socialLinks: row.social_links ?? [],
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
    buyingRole: row.buying_role ?? undefined,
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
    editedAt: row.edited_at ?? undefined,
    attachments: [],
  }
}

// --- Geschenke (0036) ---

const GIFT_OCCASION_SELECT = 'id, name, kind, ship_by, created_at'
const GIFT_PRODUCT_SELECT = 'id, occasion_id, name, description, emoji'
const GIFT_SENDER_SELECT = 'id, name, is_c_level'
const GIFT_RECIPIENT_SELECT =
  'id, occasion_id, product_id, contact_id, first_name, last_name, company, street, ' +
  'postal_code, city, country, shipping, status, status_at, note, created_at'

interface GiftOccasionRow {
  id: string
  name: string
  kind: GiftOccasionKind
  ship_by: string | null
  created_at: string
}
interface GiftProductRow {
  id: string
  occasion_id: string
  name: string
  description: string | null
  emoji: string | null
}
interface GiftSenderRow {
  id: string
  name: string
  is_c_level: boolean
}
interface GiftRecipientRow {
  id: string
  occasion_id: string
  product_id: string | null
  contact_id: string | null
  first_name: string | null
  last_name: string | null
  company: string | null
  street: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  shipping: GiftShipping
  status: GiftStatus
  status_at: string | null
  note: string | null
  created_at: string
}

const mapGiftOccasion = (r: GiftOccasionRow): GiftOccasion => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  shipBy: r.ship_by ?? undefined,
  createdAt: r.created_at,
})
const mapGiftProduct = (r: GiftProductRow): GiftProduct => ({
  id: r.id,
  occasionId: r.occasion_id,
  name: r.name,
  description: r.description ?? undefined,
  emoji: r.emoji ?? undefined,
})
const mapGiftSender = (r: GiftSenderRow): GiftSender => ({
  id: r.id,
  name: r.name,
  isCLevel: Boolean(r.is_c_level),
})
function mapGiftRecipient(r: GiftRecipientRow, senderIds: string[]): GiftRecipient {
  return {
    id: r.id,
    occasionId: r.occasion_id,
    productId: r.product_id ?? undefined,
    contactId: r.contact_id ?? undefined,
    firstName: r.first_name ?? undefined,
    lastName: r.last_name ?? undefined,
    company: r.company ?? undefined,
    street: r.street ?? undefined,
    postalCode: r.postal_code ?? undefined,
    city: r.city ?? undefined,
    country: r.country ?? undefined,
    shipping: r.shipping,
    status: r.status,
    statusAt: r.status_at ?? undefined,
    note: r.note ?? undefined,
    senderIds,
    createdAt: r.created_at,
  }
}

/** Leere Texte gehören als NULL in die Datenbank, nicht als '' (Fallstrick 10). */
const textOrNull = (v: string | null | undefined): string | null => {
  const t = v?.trim()
  return t ? t : null
}

function recipientRow(input: NewGiftRecipient, id: string): Record<string, unknown> {
  return {
    id,
    occasion_id: input.occasionId,
    product_id: input.productId ?? null,
    contact_id: input.contactId ?? null,
    first_name: textOrNull(input.firstName),
    last_name: textOrNull(input.lastName),
    company: textOrNull(input.company),
    street: textOrNull(input.street),
    postal_code: textOrNull(input.postalCode),
    city: textOrNull(input.city),
    country: textOrNull(input.country),
    shipping: input.shipping ?? 'direkt',
    status: input.status ?? 'geplant',
    status_at: input.statusAt ?? null,
    note: textOrNull(input.note),
  }
}

/** In Stücke schneiden — lange .in()-Listen sprengen sonst die Adresszeile. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Alle Zeilen einer Abfrage, seitenweise. PostgREST kann pro Abfrage deckeln
 * (Supabase-Vorgabe: 1000) und lässt den Rest dann OHNE Fehler weg — bei ~460
 * Empfängern mit je zwei Absendern liegt die Zuordnungstabelle genau dort.
 */
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  size = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < size) return out
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
      case 'company':
        row.company = patch.company ?? null
        break
      case 'hierarchyLevel':
        row.hierarchy_level = patch.hierarchyLevel ?? null
        break
      case 'additionalCompanies':
        // NOT NULL mit Vorgabe '{}' — leer heißt leere Liste, nie NULL.
        row.additional_companies = (patch.additionalCompanies ?? [])
          .map((c) => c.trim())
          .filter(Boolean)
        break
      case 'team':
        row.team = patch.team ?? null
        break
      case 'email':
        row.email = patch.email ?? null
        break
      case 'phoneWork':
        row.phone_work = patch.phoneWork ?? null
        break
      case 'phoneMobile':
        row.phone_mobile = patch.phoneMobile ?? null
        break
      case 'phonePrivate':
        row.phone_private = patch.phonePrivate ?? null
        break
      case 'phoneDirect':
        row.phone_direct = patch.phoneDirect ?? null
        break
      case 'emailPrivate':
        row.email_private = patch.emailPrivate ?? null
        break
      case 'businessAddress':
        row.business_address = patch.businessAddress ?? null
        break
      case 'assistantName':
        row.assistant_name = patch.assistantName ?? null
        break
      case 'assistantContact':
        row.assistant_contact = patch.assistantContact ?? null
        break
      case 'socialLinks':
        // jsonb-Spalte NOT NULL DEFAULT '[]' — nie NULL, leer = [].
        row.social_links = patch.socialLinks ?? []
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
      case 'buyingRole':
        row.buying_role = patch.buyingRole ?? null
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
      case 'customers':
      case 'regionIds':
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

const INTRO_SELECT = 'id, text, created_by, created_by_name, created_at, status, helper_name, resolved_at'

export interface IntroRequestRow {
  id: string
  text: string
  created_by: string
  created_by_name: string
  created_at: string
  status: IntroRequestStatus
  helper_name: string | null
  resolved_at: string | null
}

export function mapRowToIntroRequest(row: IntroRequestRow): IntroRequest {
  return {
    id: row.id,
    text: row.text,
    createdById: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    status: row.status,
    helperName: row.helper_name ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
  }
}

export interface EventRow {
  id: string
  name: string
  event_date: string
  end_date: string | null
  location: string | null
  description: string | null
}

export function mapRowToEvent(row: EventRow): EventItem {
  return {
    id: row.id,
    name: row.name,
    date: row.event_date,
    endDate: row.end_date ?? undefined,
    location: row.location ?? undefined,
    description: row.description ?? undefined,
  }
}

const EVENT_SELECT = 'id, name, event_date, end_date, location, description'
const ATTENDEE_SELECT = 'contact_id, status, purpose, slot_at, slot_minutes, meeting_point'

export interface AttendeeRow {
  contact_id: string
  status: AttendanceStatus
  purpose: string | null
  slot_at: string | null
  slot_minutes: number | null
  meeting_point: string | null
}

export function mapRowToAttendee(row: AttendeeRow): EventAttendee {
  return {
    contactId: row.contact_id,
    status: row.status,
    purpose: row.purpose ?? undefined,
    slotAt: row.slot_at ?? undefined,
    slotMinutes: row.slot_minutes ?? undefined,
    meetingPoint: row.meeting_point ?? undefined,
  }
}

export interface ReminderRow {
  id: string
  contact_id: string
  due_date: string
  due_time: string | null
  text: string
  done: boolean
  created_by_name: string
}

export function mapRowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    contactId: row.contact_id,
    dueDate: row.due_date,
    // Postgres liefert HH:MM:SS — die UI arbeitet mit HH:MM.
    dueTime: row.due_time ? row.due_time.slice(0, 5) : undefined,
    text: row.text,
    done: row.done,
    createdByName: row.created_by_name,
  }
}

/**
 * Eine Stelle für die Spaltenliste — vier Abfragen lesen Notizen (Liste,
 * Anlegen, Anhang entfernen, Löschprüfung). Als Literal nebeneinander hätte ein
 * neues Feld leicht nur in der Hälfte davon gelandet.
 */
const NOTE_SELECT =
  'id, event_id, text, author_name, author_id, attachments, created_at, contact_id, guest_id'

export interface EventNoteRow {
  id: string
  event_id: string
  text: string
  author_name: string
  author_id: string
  attachments: NoteAttachment[] | null
  created_at: string
  contact_id: string | null
  guest_id: string | null
}

const GUEST_SELECT = 'id, event_id, name, company, note, promoted_contact_id, created_at'

export interface EventGuestRow {
  id: string
  event_id: string
  name: string
  company: string | null
  note: string | null
  promoted_contact_id: string | null
  created_at: string
}

export function mapRowToEventGuest(row: EventGuestRow): EventGuest {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    company: row.company ?? undefined,
    note: row.note ?? undefined,
    promotedContactId: row.promoted_contact_id ?? undefined,
  }
}

export interface OrgUnitRow {
  id: string
  company: string
  department: string
  team: string | null
  note: string | null
}

export function mapRowToOrgUnit(row: OrgUnitRow): OrgUnit {
  return {
    id: row.id,
    company: row.company,
    department: row.department,
    team: row.team,
    note: row.note ?? undefined,
  }
}

export interface AuditRow {
  id: number
  at: string
  action: string
  entity: string
  entity_id: string | null
  actor_id: string | null
  detail: { fields?: string[] } | null
}

export function mapRowToAuditEntry(
  row: AuditRow,
  resolveName: NameResolver = () => undefined,
): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    action: row.action as AuditEntry['action'],
    entity: row.entity,
    entityId: row.entity_id ?? undefined,
    actorId: row.actor_id ?? undefined,
    // Kein Name = per Skript/Service-Key geändert, nicht über die App.
    actorName: resolveName(row.actor_id),
    fields: row.detail?.fields,
  }
}

/** Konten (Anmeldeprofile). Eine Quelle für Lesen UND für das Neulesen nach
 *  einem UPDATE, damit die beiden Wege nicht auseinanderlaufen. */
const PROFILE_SELECT = 'id, full_name, role, region_id'

export interface ProfileRow {
  id: string
  full_name: string
  role: Role
  region_id: string | null
}

export function mapRowToUser(row: ProfileRow): AppUser {
  return {
    id: row.id,
    name: row.full_name,
    role: row.role,
    regionId: row.region_id ?? undefined,
  }
}

/** Zeile aus pending_accounts() (Migration 0040). */
interface PendingAccountRow {
  id: string
  email: string
  full_name: string | null
  created_at: string
  last_sign_in_at: string | null
}

const EVERPHONE_SELECT = 'salesforce_id, name, account_type, active_rentals'

export interface EverphoneAccountRow {
  salesforce_id: string
  name: string
  account_type: string
  active_rentals: number | null
}

export function mapRowToEverphoneAccount(row: EverphoneAccountRow): EverphoneAccount {
  return {
    salesforceId: row.salesforce_id,
    name: row.name,
    status: classifyAccountType(row.account_type),
    activeRentals: row.active_rentals ?? undefined,
  }
}

export function mapRowToEventNote(row: EventNoteRow): EventNote {
  return {
    id: row.id,
    eventId: row.event_id,
    text: row.text,
    authorName: row.author_name,
    authorId: row.author_id,
    createdAt: row.created_at,
    attachments: row.attachments ?? [],
    contactId: row.contact_id ?? undefined,
    guestId: row.guest_id ?? undefined,
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
    const { data, error } = await this.client
      .from('regions')
      .select('id, name, is_placeholder')
      .order('name')
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as { id: string; name: string; is_placeholder: boolean }[]
    return rows.map((r) => ({ id: r.id, name: r.name, isPlaceholder: Boolean(r.is_placeholder) }))
  }

  /**
   * Legt ein Gebiet an — oder gibt das gleichnamige zurück, falls es das schon
   * gibt. Bewusst „finden ODER anlegen": wer im Kontakt „+ Neue Region" öffnet
   * und einen vorhandenen Namen tippt, meint dieses Gebiet. Vorher lief das in
   * einen Eindeutigkeitsfehler der Datenbank (gemeldet 2026-09-24).
   *
   * Groß-/Kleinschreibung und Randleerzeichen spielen dabei keine Rolle; der
   * Name in der Datenbank bleibt unangetastet, wir geben ihn zurück, wie er dort
   * steht.
   */
  async setContactRegions(contactId: string, regionIds: string[]): Promise<Contact> {
    const wanted = [...new Set(regionIds.filter(Boolean))]
    if (wanted.length === 0) throw new Error('Mindestens ein Gebiet ist nötig')

    const { data: existingRows, error: readError } = await this.client
      .from('contact_regions')
      .select('region_id')
      .eq('contact_id', contactId)
    if (readError) throw new Error(readError.message)
    const current = ((existingRows ?? []) as unknown as { region_id: string }[]).map(
      (r) => r.region_id,
    )

    // Erst hinzufügen, dann entfernen. Andersherum stünde der Kontakt einen
    // Augenblick ohne Gebiet da — und der Trigger weist genau das ab.
    const toAdd = wanted.filter((id) => !current.includes(id))
    const toRemove = current.filter((id) => !wanted.includes(id))

    if (toAdd.length > 0) {
      const { error } = await this.client
        .from('contact_regions')
        .insert(toAdd.map((region_id) => ({ contact_id: contactId, region_id })))
      if (error) throw new Error(error.message)
    }
    if (toRemove.length > 0) {
      const { error } = await this.client
        .from('contact_regions')
        .delete()
        .eq('contact_id', contactId)
        .in('region_id', toRemove)
      if (error) throw new Error(error.message)
    }

    // Nachlesen statt annehmen: eine von der Policy gefilterte Änderung liefert
    // 0 Zeilen und KEINEN Fehler (wie bei deleteRegion).
    const contact = await this.getContact(contactId)
    if (!contact) throw new Error('Kontakt nicht gefunden oder keine Berechtigung')
    const after = [...(contact.regionIds ?? [contact.regionId])].sort()
    if (after.join(',') !== [...wanted].sort().join(',')) {
      throw new Error('Gebiete konnten nicht gesetzt werden')
    }
    return contact
  }

  async mergeContacts(winnerId: string, loserId: string, patch: ContactPatch = {}): Promise<Contact> {
    if (winnerId === loserId) throw new Error('Ein Kontakt lässt sich nicht mit sich selbst zusammenführen')
    const [winner, loser] = await Promise.all([this.getContact(winnerId), this.getContact(loserId)])
    if (!winner || !loser) throw new Error('Kontakt nicht gefunden oder keine Berechtigung')
    const { fileStore } = await import('@/lib/fileStore')

    // Beziehungen vereint die Datenbankfunktion — sie gehören nicht in das
    // Feld-Speichern, das sie sonst ERSETZEN würde.
    const fieldPatch: ContactPatch = { ...patch }
    delete fieldPatch.sideFacts
    delete fieldPatch.gallery
    delete fieldPatch.customers
    delete fieldPatch.regionIds

    const galleryCopies: string[] = []
    let avatarCopy: string | undefined
    let avatarCommitted = false
    try {
      // 1. Dateien des Verlierers in den Ordner des Gewinners kopieren (Fallstrick 3).
      const refMap: Record<string, string> = {}
      for (const photo of loser.gallery ?? []) {
        const copy = await fileStore.copyToContact(photo.url, winnerId)
        if (copy !== photo.url) {
          refMap[photo.url] = copy
          galleryCopies.push(copy)
        }
      }
      const takesLoserPhoto = patch.photoUrl !== undefined && !!loser.photoUrl && patch.photoUrl === loser.photoUrl
      if (takesLoserPhoto) {
        const copy = await fileStore.copyToContact(loser.photoUrl!, winnerId)
        if (copy !== loser.photoUrl) avatarCopy = copy
        fieldPatch.photoUrl = copy
      }

      // 2. Felder des Gewinners über den normalen Weg setzen.
      if (Object.keys(fieldPatch).length > 0) {
        await this.updateContact(winnerId, fieldPatch)
        avatarCommitted = takesLoserPhoto
      }

      // 3. Verweise umhängen, Verlierer löschen — eine Transaktion in der Datenbank.
      const { error } = await this.client.rpc('merge_contacts', {
        p_winner: winnerId,
        p_loser: loserId,
        p_ref_map: refMap,
      })
      if (error) throw new Error(error.message)
    } catch (err) {
      // Nur Kopien entfernen, auf die noch nichts zeigt. Ein bereits gespeichertes
      // Foto des Gewinners bleibt — es ist jetzt seins.
      for (const c of galleryCopies) await fileStore.remove(c).catch(() => undefined)
      if (avatarCopy && !avatarCommitted) await fileStore.remove(avatarCopy).catch(() => undefined)
      throw err
    }

    // 4. Aufräumen: die Originale des Verlierers, und ein ersetztes Foto des Gewinners.
    await fileStore.removeContactFiles(loserId).catch(() => undefined)
    if (avatarCommitted && winner.photoUrl && winner.photoUrl !== fieldPatch.photoUrl) {
      await fileStore.remove(winner.photoUrl).catch(() => undefined)
    }

    const merged = await this.getContact(winnerId)
    if (!merged) throw new Error('Zusammengeführter Kontakt nicht lesbar')
    return merged
  }

  async createRegion(name: string): Promise<Region> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Regionsname darf nicht leer sein')
    const existing = await this.findRegionByName(trimmed)
    if (existing) return existing
    // Neue Gebiete sind nie Platzhalter — das Kennzeichen ist dem Import-Rest
    // „Unbekannt" vorbehalten (0024). RLS `regions_insert` (0029) lässt nur RM+ zu.
    const { data, error } = await this.client
      .from('regions')
      .insert({ name: trimmed, is_placeholder: false })
      .select('id, name, is_placeholder')
      .single()
    if (error) {
      // Wettlauf: zwischen Suche und INSERT hat jemand anders denselben Namen
      // angelegt. Dann ist das Ergebnis trotzdem das gewünschte Gebiet.
      const raced = await this.findRegionByName(trimmed)
      if (raced) return raced
      throw new Error(error.message)
    }
    const r = data as unknown as { id: string; name: string; is_placeholder: boolean }
    return { id: r.id, name: r.name, isPlaceholder: Boolean(r.is_placeholder) }
  }

  /** Gebiet nach Namen suchen, Groß-/Kleinschreibung egal. `ilike` ohne Platzhalter
   *  ist ein exakter Vergleich — die Sonderzeichen `%` und `_` maskieren wir, damit
   *  „Public Mitte_West" nicht plötzlich auf „Public Mitte/West" passt. */
  private async findRegionByName(trimmed: string): Promise<Region | undefined> {
    const pattern = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)
    const { data, error } = await this.client
      .from('regions')
      .select('id, name, is_placeholder')
      .ilike('name', pattern)
      .limit(1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as { id: string; name: string; is_placeholder: boolean }[]
    const r = rows[0]
    return r ? { id: r.id, name: r.name, isPlaceholder: Boolean(r.is_placeholder) } : undefined
  }

  async renameRegion(id: string, name: string): Promise<Region> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Regionsname darf nicht leer sein')
    // KEIN upsert (der schriebe die ganze Zeile und nullte is_placeholder /
    // created_at): erst gezielt den Namen aktualisieren, dann neu lesen — wie
    // setAttendee / updateEventGuest. RLS `regions_update` (0029) beschränkt auf RM+.
    const { error } = await this.client.from('regions').update({ name: trimmed }).eq('id', id)
    if (error) throw new Error(error.message)
    const { data, error: selError } = await this.client
      .from('regions')
      .select('id, name, is_placeholder')
      .eq('id', id)
      .single()
    if (selError) throw new Error(selError.message)
    const r = data as unknown as { id: string; name: string; is_placeholder: boolean }
    return { id: r.id, name: r.name, isPlaceholder: Boolean(r.is_placeholder) }
  }

  async deleteRegion(id: string): Promise<void> {
    // Benutzte Gebiete stoppt die Datenbank selbst: contacts.region_id und
    // profiles.region_id sind FKs ohne ON DELETE — hier wird nur der
    // 23503-Fehler lesbar gemacht.
    const { error } = await this.client.from('regions').delete().eq('id', id)
    if (error) {
      throw new Error(
        error.message.includes('foreign key')
          ? 'Region wird noch verwendet — erst Kontakte/Nutzer umziehen, dann löschen.'
          : error.message,
      )
    }
    // Die Delete-Policy (0030) lässt den Platzhalter nie los: das DELETE trifft
    // dann 0 Zeilen und meldet KEINEN Fehler — deshalb nachprüfen, ob die Zeile
    // wirklich weg ist, statt still „Erfolg" zu melden.
    const { data, error: selError } = await this.client
      .from('regions')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (selError) throw new Error(selError.message)
    if (data) throw new Error('Region ist geschützt und wurde nicht gelöscht.')
  }

  async listUsers(): Promise<AppUser[]> {
    const { data, error } = await this.client.from('profiles').select(PROFILE_SELECT)
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as ProfileRow[]).map(mapRowToUser)
  }

  async updateUser(
    id: string,
    patch: { role?: Role; regionId?: string | null },
  ): Promise<AppUser> {
    // Nur die wirklich gemeinten Spalten in die Zeile: `undefined` heißt „nicht
    // anfassen", `null` bei region_id heißt „keine Region" (RMs haben oft keine).
    const row: Record<string, unknown> = {}
    if (patch.role !== undefined) row.role = patch.role
    if (patch.regionId !== undefined) row.region_id = patch.regionId ?? null

    // Leerer Patch: nicht schreiben. PostgREST lehnt einen leeren PATCH-Rumpf
    // ab, und ein Schreibzugriff ohne Inhalt würde nur den Audit-Trigger aus
    // 0033 beschäftigen. Stattdessen den aktuellen Stand zurückgeben.
    if (Object.keys(row).length === 0) {
      const { data, error } = await this.client
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('id', id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('Konto nicht gefunden.')
      return mapRowToUser(data as unknown as ProfileRow)
    }

    // UPDATE-dann-Neulesen, KEIN upsert — der schriebe die ganze Zeile und
    // nullte full_name und die nicht mitgeschickte Spalte (Fallstrick 1).
    // Die zurückgegebene Zeile ist zugleich die Probe: filtert die Policy
    // `profiles_update` (0033) das UPDATE weg, kommen 0 Zeilen und KEIN Fehler
    // — derselbe Fallstrick wie bei deleteRegion und removeEventNoteAttachment.
    const { data, error } = await this.client
      .from('profiles')
      .update(row)
      .eq('id', id)
      .select(PROFILE_SELECT)
    // Die Sperren des Triggers profiles_guard_change (eigene Rolle, letzter
    // Administrator) kommen als ganz normaler Fehler mit Code 42501 an. Seine
    // Meldung ist bereits für Menschen geschrieben und wird deshalb
    // durchgereicht, statt sie durch eine allgemeine zu ersetzen.
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as ProfileRow[]
    if (rows.length === 0) {
      throw new Error('Nur der Administrator darf Rollen und Regionen ändern.')
    }
    return mapRowToUser(rows[0])
  }

  async listPendingAccounts(): Promise<PendingAccount[]> {
    const { data, error } = await this.client.rpc('pending_accounts')
    if (error) throw new Error(error.message)
    return ((data ?? []) as PendingAccountRow[]).map((r) => ({
      id: r.id,
      email: r.email,
      name: r.full_name ?? r.email,
      createdAt: r.created_at,
      lastSignInAt: r.last_sign_in_at ?? undefined,
    }))
  }

  async approveAccount(id: string, role: Role, regionId?: string): Promise<AppUser> {
    // Die Funktion prüft Leitung, Region für Account Manager und „nur einmal";
    // danach das neue Profil lesen, damit die Seite den echten Stand zeigt.
    const { error } = await this.client.rpc('approve_account', {
      p_user: id,
      p_role: role,
      p_region: regionId ?? null,
    })
    if (error) throw new Error(error.message)
    const { data, error: readError } = await this.client
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (readError) throw new Error(readError.message)
    if (!data) throw new Error('Konto nicht gefunden.')
    return mapRowToUser(data as unknown as ProfileRow)
  }

  async listContacts(): Promise<Contact[]> {
    const [{ data, error }, names] = await Promise.all([
      this.client.from(CONTACT_READ).select(CONTACT_SELECT).order('full_name'),
      this.names(),
    ])
    if (error) throw new Error(error.message)
    const resolve = this.resolver(names)
    return ((data ?? []) as unknown as ContactRow[]).map((row) => mapRowToContact(row, resolve))
  }

  async getContact(id: string): Promise<Contact | undefined> {
    const [{ data, error }, names] = await Promise.all([
      this.client.from(CONTACT_READ).select(CONTACT_SELECT).eq('id', id).maybeSingle(),
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
        company: input.company ?? null,
        team: input.team ?? null,
        email: input.email ?? null,
        phone_work: input.phoneWork ?? null,
        phone_mobile: input.phoneMobile ?? null,
        phone_private: input.phonePrivate ?? null,
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

    // Gebiete zuerst: steht der Kontakt danach nicht mehr im eigenen Gebiet,
    // sollen die übrigen Änderungen trotzdem geschrieben sein.
    if (patch.regionIds !== undefined) {
      await this.setContactRegions(id, patch.regionIds)
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

    // Customers are shared entities + link rows: create missing customers,
    // then diff the contact_customers links (same pattern as the gallery).
    if (patch.customers !== undefined) {
      const { data: existing, error: exErr } = await this.client
        .from('contact_customers')
        .select('customer_id')
        .eq('contact_id', id)
      if (exErr) throw new Error(exErr.message)
      const existingIds = new Set(
        ((existing ?? []) as { customer_id: string }[]).map((r) => r.customer_id),
      )
      const keptIds = new Set(patch.customers.map((c) => c.id))
      const removed = [...existingIds].filter((x) => !keptIds.has(x))
      if (removed.length > 0) {
        const { error: delErr } = await this.client
          .from('contact_customers')
          .delete()
          .eq('contact_id', id)
          .in('customer_id', removed)
        if (delErr) throw new Error(delErr.message)
      }
      for (const cust of patch.customers.filter((c) => !existingIds.has(c.id))) {
        const { data: created, error: custErr } = await this.client
          .from('customers')
          .insert({ name: cust.name, salesforce_url: cust.salesforceUrl ?? null })
          .select('id')
          .single()
        if (custErr) throw new Error(custErr.message)
        const { error: linkErr } = await this.client.from('contact_customers').insert({
          contact_id: id,
          customer_id: (created as { id: string }).id,
          with_us: cust.withUs,
        })
        if (linkErr) throw new Error(linkErr.message)
      }
    }

    const updated = await this.getContact(id)
    if (!updated) throw new Error(`contact ${id} not found after update`)
    return updated
  }

  /**
   * Kontaktfoto über die Datenbankfunktion `set_contact_photo` (Migration 0032)
   * setzen oder mit `null` entfernen.
   *
   * BEWUSST kein `update` auf `contacts` — auch wenn es hier kürzer aussähe.
   * Die Policy `contacts_update` steht weiter auf `is_privileged()` (RM+), weil
   * RLS zeilen- und nicht spaltenbasiert ist: eine gelockerte UPDATE-Policy
   * öffnete Account Managern JEDE Spalte ihrer Regionskontakte, nicht nur das
   * Foto. Ein `update` hier würde für sie also schlicht nichts ändern (0 Zeilen,
   * ohne Fehler). Die Funktion ist der einzige Weg, der für jede Rolle trägt;
   * sie prüft selbst `can_see_contact()` (42501) und die Pfadkonvention aus
   * Fallstrick 3 (22023) und löst den Audit-Trigger wie jedes andere UPDATE aus.
   */
  async setContactPhoto(contactId: string, photoUrl: string | null): Promise<Contact> {
    const { error } = await this.client.rpc('set_contact_photo', {
      p_contact_id: contactId,
      p_photo_url: photoUrl,
    })
    if (error) throw new Error(error.message)
    const updated = await this.getContact(contactId)
    if (!updated) throw new Error('Kontakt nach dem Speichern des Fotos nicht gefunden.')
    return updated
  }

  async reassignContacts(fromUserId: string, toUserId: string): Promise<number> {
    const { data, error } = await this.client
      .from('contacts')
      .update({ relationship_manager_id: toUserId })
      .eq('relationship_manager_id', fromUserId)
      .select('id')
    if (error) throw new Error(error.message)
    return ((data ?? []) as { id: string }[]).length
  }

  async bulkAssign(contactIds: string[], patch: BulkAssignPatch): Promise<number> {
    if (contactIds.length === 0) return 0
    // Teil-Update: nur die übergebenen Spalten. KEIN upsert — der schriebe die
    // ganze Zeile und setzte alles Nichtübergebene auf NULL (siehe setAttendee).
    const addRegion = patch.regionId !== undefined && patch.regionMode === 'add'
    const row: Record<string, string> = {}
    // Beim Hinzufügen bleibt das führende Gebiet stehen — die Spalte wird dann
    // gar nicht angefasst, die neue Zuordnung geht direkt in contact_regions.
    if (patch.regionId !== undefined && !addRegion) row.region_id = patch.regionId
    if (patch.relationshipManagerId !== undefined) {
      row.relationship_manager_id = patch.relationshipManagerId
    }
    if (Object.keys(row).length === 0 && !addRegion) return 0

    let matched: number
    if (Object.keys(row).length > 0) {
      const { data, error } = await this.client
        .from('contacts')
        .update(row)
        .in('id', contactIds)
        .select('id')
      if (error) throw new Error(error.message)
      matched = ((data ?? []) as { id: string }[]).length
    } else {
      const { data, error } = await this.client.from('contacts').select('id').in('id', contactIds)
      if (error) throw new Error(error.message)
      matched = ((data ?? []) as { id: string }[]).length
    }

    if (patch.regionId !== undefined) {
      const target = patch.regionId
      const { data: rows, error: readError } = await this.client
        .from('contact_regions')
        .select('contact_id, region_id')
        .in('contact_id', contactIds)
      if (readError) throw new Error(readError.message)
      const memberships = (rows ?? []) as unknown as { contact_id: string; region_id: string }[]

      if (addRegion) {
        // Nur fehlende Zuordnungen schreiben. Kein upsert (Fallstrick 1), und ein
        // zweites INSERT auf dasselbe Paar liefe in den Primärschlüssel.
        const has = new Set(
          memberships.filter((m) => m.region_id === target).map((m) => m.contact_id),
        )
        const missing = contactIds.filter((id) => !has.has(id))
        if (missing.length > 0) {
          const { error } = await this.client
            .from('contact_regions')
            .insert(missing.map((contact_id) => ({ contact_id, region_id: target })))
          if (error) throw new Error(error.message)
        }
      } else {
        // Ersetzen: region_id ist oben schon gesetzt, der Trigger hat die
        // Mitgliedschaft angelegt. Jetzt die übrigen Gebiete dieser Kontakte
        // entfernen. Das führende ist bereits `target`, der Nachrück-Trigger
        // greift also nicht.
        const others = [...new Set(memberships.map((m) => m.region_id))].filter((r) => r !== target)
        if (others.length > 0) {
          const { error } = await this.client
            .from('contact_regions')
            .delete()
            .in('contact_id', contactIds)
            .in('region_id', others)
          if (error) throw new Error(error.message)
        }
      }
    }
    return matched
  }

  async deleteContact(id: string): Promise<void> {
    // Dateien ZUERST: ON DELETE CASCADE räumt nur Tabellenzeilen, die Dateien
    // im Storage kennt Postgres nicht. Scheitert danach das Löschen der Zeile,
    // fehlen zwar Bilder, aber der Kontakt ist noch da — wiederholbar. In der
    // umgekehrten Reihenfolge blieben Personenfotos ohne jede Referenz liegen,
    // also unsichtbar und trotzdem vorhanden. Das ist der schlimmere Fall.
    const { fileStore } = await import('@/lib/fileStore')
    await fileStore.removeContactFiles(id)

    // Anhänge an Event-Notizen fasst removeContactFiles nicht: sie liegen unter
    // <eventId>/… (EventNotes.tsx), sind über den Pfad also nicht kontaktbezogen
    // auffindbar. Ihre Verweise stehen in der Notiz-Zeile, die gleich per
    // Kaskade verschwindet — daher vorher auslesen und einzeln entfernen. Sonst
    // bleiben Fotos und Sprachmemos referenzlos in der Ablage liegen, und die
    // sind laut 0012 personenbezogene Daten des Kontakts.
    const { data: notes } = await this.client
      .from('event_notes')
      .select('attachments')
      .eq('contact_id', id)
    for (const note of (notes ?? []) as { attachments?: unknown }[]) {
      const list = Array.isArray(note.attachments) ? note.attachments : []
      for (const entry of list) {
        const ref = (entry as { url?: unknown })?.url
        // remove() lässt Data-URLs und externe Links unangetastet.
        if (typeof ref === 'string' && ref) await fileStore.remove(ref)
      }
    }

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

  async listAllContactLinks(): Promise<ContactLink[]> {
    const { data, error } = await this.client
      .from('contact_links')
      .select('id, from_contact_id, to_contact_id, kind, note')
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
        .from(ACTIVITY_READ)
        .select(ACTIVITY_SELECT)
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
      .select(ACTIVITY_SELECT)
      .single()
    if (error) throw new Error(error.message)
    const names = await this.names()
    return mapRowToActivity(data as unknown as ActivityRow, this.resolver(names))
  }

  async updateActivity(id: string, body: string): Promise<Activity> {
    const trimmed = body.trim()
    if (!trimmed) throw new Error('Der Text darf nicht leer sein')
    // Die Art des Eintrags geht in die Zusammenfassung ein und ist unveränderlich
    // (Trigger in 0034) — deshalb von der Zeile lesen statt vom Aufrufer glauben.
    const { data: current, error: readError } = await this.client
      .from(ACTIVITY_READ)
      .select('id, type')
      .eq('id', id)
      .maybeSingle()
    if (readError) throw new Error(readError.message)
    if (!current) throw new Error('Eintrag nicht gefunden oder keine Berechtigung')
    const { type } = current as unknown as { type: ActivityType }

    // KEIN upsert (schriebe die ganze Zeile und nullte Kontakt, Verfasser und
    // Zeitpunkt) — erst gezielt ändern, dann über die redaktierende View neu
    // lesen. Die Zusammenfassung wird mitgezogen, sonst beschriebe sie nach der
    // Korrektur einen Text, den es nicht mehr gibt.
    const { error } = await this.client
      .from('activities')
      .update({
        body: trimmed,
        ai_summary: localSummarizer.activitySummary({ type, body: trimmed }),
      })
      .eq('id', id)
    if (error) throw new Error(error.message)

    const [{ data, error: selError }, names] = await Promise.all([
      this.client.from(ACTIVITY_READ).select(ACTIVITY_SELECT).eq('id', id).maybeSingle(),
      this.names(),
    ])
    if (selError) throw new Error(selError.message)
    // Von der Policy gefiltert: das UPDATE lief ins Leere, ohne Fehler zu melden.
    if (!data) throw new Error('Eintrag nicht gefunden oder keine Berechtigung')
    return mapRowToActivity(data as unknown as ActivityRow, this.resolver(names))
  }

  async removeActivity(id: string): Promise<void> {
    const { error } = await this.client.from('activities').delete().eq('id', id)
    if (error) throw new Error(error.message)
    // Nachprüfen wie in deleteRegion: eine von der RLS gefilterte Löschung
    // liefert 0 Zeilen und KEINEN Fehler.
    const { count, error: countError } = await this.client
      .from(ACTIVITY_READ)
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
    if (countError) throw new Error(countError.message)
    if ((count ?? 0) > 0) throw new Error('Eintrag konnte nicht gelöscht werden')
  }

  async listAllActivities(): Promise<Activity[]> {
    const [{ data, error }, names] = await Promise.all([
      this.client
        .from(ACTIVITY_READ)
        .select(ACTIVITY_SELECT)
        .order('occurred_at', { ascending: false }),
      this.names(),
    ])
    if (error) throw new Error(error.message)
    const resolve = this.resolver(names)
    return ((data ?? []) as unknown as ActivityRow[]).map((row) => mapRowToActivity(row, resolve))
  }

  async listIntroRequests(): Promise<IntroRequest[]> {
    const { data, error } = await this.client
      .from('intro_requests')
      .select(INTRO_SELECT)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as IntroRequestRow[]).map(mapRowToIntroRequest)
  }

  async addIntroRequest(input: NewIntroRequest): Promise<IntroRequest> {
    const { data, error } = await this.client
      .from('intro_requests')
      .insert({
        text: input.text,
        created_by: input.createdById,
        created_by_name: input.createdByName,
        status: 'open',
      })
      .select(INTRO_SELECT)
      .single()
    if (error) throw new Error(error.message)
    return mapRowToIntroRequest(data as unknown as IntroRequestRow)
  }

  async resolveIntroRequest(id: string, helperName: string): Promise<IntroRequest> {
    const { data, error } = await this.client
      .from('intro_requests')
      .update({ status: 'resolved', helper_name: helperName, resolved_at: new Date().toISOString() })
      .eq('id', id)
      .select(INTRO_SELECT)
      .single()
    if (error) throw new Error(error.message)
    return mapRowToIntroRequest(data as unknown as IntroRequestRow)
  }

  async deleteIntroRequest(id: string): Promise<void> {
    const { error } = await this.client.from('intro_requests').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async listEvents(): Promise<EventItem[]> {
    const { data, error } = await this.client
      .from('events')
      .select(EVENT_SELECT)
      .order('event_date')
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as EventRow[]).map(mapRowToEvent)
  }

  async getEvent(id: string): Promise<EventItem | undefined> {
    const { data, error } = await this.client
      .from('events')
      .select(EVENT_SELECT)
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
        end_date: input.endDate ?? null,
        location: input.location ?? null,
        description: input.description ?? null,
      })
      .select(EVENT_SELECT)
      .single()
    if (error) throw new Error(error.message)
    return mapRowToEvent(data as unknown as EventRow)
  }

  async listEventAttendees(eventId: string): Promise<EventAttendee[]> {
    const { data, error } = await this.client
      .from('event_attendees')
      .select(ATTENDEE_SELECT)
      .eq('event_id', eventId)
      .order('slot_at', { nullsFirst: false })
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as AttendeeRow[]).map(mapRowToAttendee)
  }

  async setAttendee(
    eventId: string,
    contactId: string,
    patch: AttendeePatch,
  ): Promise<EventAttendee> {
    const row: Record<string, unknown> = {}
    if (patch.status !== undefined) row.status = patch.status
    if (patch.purpose !== undefined) row.purpose = patch.purpose
    if (patch.slotAt !== undefined) {
      row.slot_at = patch.slotAt
      // Ohne Termin ist eine Dauer sinnlos — der DB-Check verbietet sie auch.
      if (patch.slotAt === null) row.slot_minutes = null
    }
    if (patch.slotMinutes !== undefined) row.slot_minutes = patch.slotMinutes
    if (patch.meetingPoint !== undefined) row.meeting_point = patch.meetingPoint

    // KEIN upsert: PostgREST schreibt bei `merge-duplicates` die ganze Zeile
    // und setzt alles, was nicht im Payload steht, auf NULL — ein Status-
    // Wechsel würde also Termin und „Wofür" mitlöschen. Deshalb erst
    // aktualisieren und nur anlegen, wenn es die Zeile noch nicht gibt.
    if (Object.keys(row).length > 0) {
      const { data: updated, error: updateError } = await this.client
        .from('event_attendees')
        .update(row)
        .eq('event_id', eventId)
        .eq('contact_id', contactId)
        .select(ATTENDEE_SELECT)
      if (updateError) throw new Error(updateError.message)
      const hit = (updated ?? []) as unknown as AttendeeRow[]
      if (hit.length > 0) return mapRowToAttendee(hit[0])
    }

    const { data, error } = await this.client
      .from('event_attendees')
      .insert({ event_id: eventId, contact_id: contactId, ...row })
      .select(ATTENDEE_SELECT)
      .single()
    if (error) throw new Error(error.message)
    return mapRowToAttendee(data as unknown as AttendeeRow)
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
      .select('id, contact_id, due_date, due_time, text, done, created_by_name')
      .order('due_date')
      .order('due_time', { nullsFirst: true })
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
        due_time: input.dueTime ?? null,
        text: input.text,
        created_by_name: input.createdByName,
        done: false,
      })
      .select('id, contact_id, due_date, due_time, text, done, created_by_name')
      .single()
    if (error) throw new Error(error.message)
    return mapRowToReminder(data as unknown as ReminderRow)
  }

  async toggleReminder(id: string, done: boolean): Promise<Reminder> {
    const { data, error } = await this.client
      .from('reminders')
      .update({ done })
      .eq('id', id)
      .select('id, contact_id, due_date, due_time, text, done, created_by_name')
      .single()
    if (error) throw new Error(error.message)
    return mapRowToReminder(data as unknown as ReminderRow)
  }

  async listAuditLog(limit = 100): Promise<AuditEntry[]> {
    const [{ data, error }, names] = await Promise.all([
      this.client
        .from('audit_log')
        .select('id, at, action, entity, entity_id, actor_id, detail')
        // `at` ist die Transaktionszeit: mehrere Änderungen aus EINEM Request
        // tragen dieselbe. Die laufende Nummer entscheidet dann.
        .order('at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit),
      this.names(),
    ])
    if (error) throw new Error(error.message)
    const resolve = this.resolver(names)
    return ((data ?? []) as unknown as AuditRow[]).map((row) => mapRowToAuditEntry(row, resolve))
  }

  async listOrgUnits(): Promise<OrgUnit[]> {
    const { data, error } = await this.client
      .from('org_units')
      .select('id, company, department, team, note')
      .order('company')
      .order('department')
      .order('team', { nullsFirst: true })
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as OrgUnitRow[]).map(mapRowToOrgUnit)
  }

  async listOrgUnitNames(): Promise<Pick<OrgUnit, 'company' | 'department' | 'team'>[]> {
    // Die Tabelle liest seit 0037 nur die Leitung; die Vorschläge brauchen nur
    // die Namen, und die liefert org_unit_names() jedem RM+.
    const { data, error } = await this.client.rpc('org_unit_names')
    if (error) throw new Error(error.message)
    return ((data ?? []) as { company: string; department: string; team: string | null }[]).map((r) => ({
      company: r.company,
      department: r.department,
      team: r.team,
    }))
  }

  async createOrgUnit(input: { company: string; department: string; team?: string; note?: string }): Promise<OrgUnit> {
    const company = input.company.trim()
    const department = input.department.trim()
    if (!company || !department) throw new Error('Firma und Abteilung sind Pflicht')
    const { data, error } = await this.client
      .from('org_units')
      .insert({ company, department, team: textOrNull(input.team), note: textOrNull(input.note) })
      .select('id, company, department, team, note')
      .single()
    if (error) throw new Error(error.message)
    return mapRowToOrgUnit(data as unknown as OrgUnitRow)
  }

  async updateOrgUnit(
    id: string,
    patch: { company?: string; department?: string; team?: string | null; note?: string | null },
  ): Promise<OrgUnit> {
    const row: Record<string, unknown> = {}
    if (patch.company !== undefined) {
      if (!patch.company.trim()) throw new Error('Firma und Abteilung sind Pflicht')
      row.company = patch.company.trim()
    }
    if (patch.department !== undefined) {
      if (!patch.department.trim()) throw new Error('Firma und Abteilung sind Pflicht')
      row.department = patch.department.trim()
    }
    if (patch.team !== undefined) row.team = textOrNull(patch.team)
    if (patch.note !== undefined) row.note = textOrNull(patch.note)
    if (Object.keys(row).length > 0) {
      const { error } = await this.client.from('org_units').update(row).eq('id', id)
      if (error) throw new Error(error.message)
    }
    const { data, error } = await this.client
      .from('org_units')
      .select('id, company, department, team, note')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('Einheit nicht gefunden oder keine Berechtigung')
    return mapRowToOrgUnit(data as unknown as OrgUnitRow)
  }

  async deleteOrgUnit(id: string): Promise<void> {
    await this.deleteAndVerify('org_units', id, 'Einheit konnte nicht gelöscht werden')
  }

  async listFavorites(profileId: string): Promise<string[]> {
    // RLS (favorites_select, 0031) liefert ohnehin nur eigene Zeilen; der Filter
    // macht die Absicht explizit und hält Mock und Adapter gleich.
    const { data, error } = await this.client
      .from('favorites')
      .select('contact_id')
      .eq('profile_id', profileId)
    if (error) throw new Error(error.message)
    // Set statt roher Liste: Postgres verhindert Dubletten per Primärschlüssel,
    // aber die Oberfläche soll auch dann nicht doppelt zählen, wenn ein Client
    // sie anders liefert.
    return [...new Set(((data ?? []) as { contact_id: string }[]).map((r) => r.contact_id))]
  }

  async addFavorite(profileId: string, contactId: string): Promise<void> {
    // Der Adapter liest die Anmeldung nicht selbst (wie authorId in addActivity):
    // die Oberfläche reicht die eigene ID herein, die Policy favorites_insert
    // (0031) weist jede fremde ab.
    //
    // KEIN upsert — der Adapter kennt bewusst keines mehr (CLAUDE.md, Fallstrick
    // 1). Zwei schnelle Klicks auf denselben Stern erzeugen stattdessen einen
    // 23505 (unique_violation) auf dem Primärschlüssel: kein Fehler, der Stern
    // ist gesetzt.
    const { error } = await this.client
      .from('favorites')
      .insert({ profile_id: profileId, contact_id: contactId })
    if (error && error.code !== '23505') throw new Error(error.message)
  }

  async removeFavorite(profileId: string, contactId: string): Promise<void> {
    const { error } = await this.client
      .from('favorites')
      .delete()
      .eq('profile_id', profileId)
      .eq('contact_id', contactId)
    if (error) throw new Error(error.message)
  }

  async matchEverphoneAccounts(customerNames: string[]): Promise<EverphoneAccount[]> {
    const keys = [...new Set(customerNames.map(normalizeCompanyName).filter(Boolean))]
    if (keys.length === 0) return []
    const { data, error } = await this.client
      .from('everphone_accounts')
      .select(EVERPHONE_SELECT)
      .in('name_normalized', keys)
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as EverphoneAccountRow[]).map(mapRowToEverphoneAccount)
  }

  async searchEverphoneAccounts(term: string, limit = 8): Promise<EverphoneAccount[]> {
    const needle = term.trim()
    if (needle.length < 2) return []
    // Suche auf dem Rohnamen (der Nutzer tippt „Nordm", nicht normalisiert);
    // % und _ escapen, damit Eingaben nicht als Wildcards wirken.
    const pattern = `%${needle.replace(/[%_\\]/g, (m) => `\\${m}`)}%`
    const { data, error } = await this.client
      .from('everphone_accounts')
      .select(EVERPHONE_SELECT)
      .ilike('name', pattern)
      .order('name')
      .limit(limit)
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as EverphoneAccountRow[]).map(mapRowToEverphoneAccount)
  }

  async deleteReminder(id: string): Promise<void> {
    const { error } = await this.client.from('reminders').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async listEventNotes(eventId: string): Promise<EventNote[]> {
    const { data, error } = await this.client
      .from('event_notes')
      .select(NOTE_SELECT)
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
        // Der Adapter liest die Sitzung nicht selbst aus — wie addActivity
        // bekommt er die ID von der Oberfläche. Durchsetzen muss es ohnehin der
        // Server: die Policy `event_notes_insert` (`author_id = auth.uid()`)
        // weist ein INSERT mit fremder ID ab, eine Prüfung im Client wäre nur
        // Kosmetik.
        author_id: input.authorId,
        attachments: input.attachments,
        contact_id: input.contactId ?? null,
        guest_id: input.guestId ?? null,
      })
      .select(NOTE_SELECT)
      .single()
    if (error) throw new Error(error.message)
    return mapRowToEventNote(data as unknown as EventNoteRow)
  }

  async deleteEventNote(id: string): Promise<void> {
    // Anhänge VOR dem Löschen auslesen — danach ist die Zeile weg und mit ihr
    // der einzige Verweis auf die Dateien. Gleicher Ablauf wie die
    // Notiz-Aufräumung in deleteContact.
    const { data: before, error: readError } = await this.client
      .from('event_notes')
      .select('attachments')
      .eq('id', id)
      .maybeSingle()
    if (readError) throw new Error(readError.message)

    const { error } = await this.client.from('event_notes').delete().eq('id', id)
    if (error) throw new Error(error.message)

    // Ein von der Policy gefiltertes DELETE trifft 0 Zeilen und meldet KEINEN
    // Fehler (derselbe Fallstrick wie beim Platzhalter in deleteRegion).
    // Deshalb nachlesen: steht die Notiz noch, war es eine Ablehnung — dann
    // bleiben auch die Dateien liegen, sonst hinge die Notiz sichtbar mit
    // kaputten Bildern da.
    const { data: after, error: checkError } = await this.client
      .from('event_notes')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (checkError) throw new Error(checkError.message)
    if (after) throw new Error('Diese Notiz darf nur der Verfasser oder ein Relationship Manager löschen.')

    // Erst jetzt die Dateien, best effort: die Zeile ist bereits weg, ein
    // Fehler in der Ablage darf das nicht nachträglich zum Misserfolg machen.
    const { fileStore } = await import('@/lib/fileStore')
    const list = Array.isArray((before as { attachments?: unknown } | null)?.attachments)
      ? ((before as { attachments: unknown[] }).attachments)
      : []
    for (const entry of list) {
      const ref = (entry as { url?: unknown })?.url
      // remove() lässt Data-URLs und externe Links unangetastet.
      if (typeof ref === 'string' && ref) await fileStore.remove(ref).catch(() => undefined)
    }
  }

  async removeEventNoteAttachment(noteId: string, attachmentId: string): Promise<EventNote> {
    const { data: current, error: readError } = await this.client
      .from('event_notes')
      .select(NOTE_SELECT)
      .eq('id', noteId)
      .maybeSingle()
    if (readError) throw new Error(readError.message)
    if (!current) throw new Error('Notiz nicht gefunden.')
    const note = mapRowToEventNote(current as unknown as EventNoteRow)

    const removed = note.attachments.find((a) => a.id === attachmentId)
    // Unbekannte ID: nichts zu tun. Kein Schreibzugriff, keine Datei angefasst.
    if (!removed) return note
    const remaining = note.attachments.filter((a) => a.id !== attachmentId)

    // UPDATE-dann-Neulesen, KEIN upsert — der schriebe die ganze Zeile und
    // nullte Text, Zuordnung und Zeitstempel (Fallstrick 1). Die zurückgegebene
    // Zeile ist zugleich die Probe: filtert `event_notes_update` das UPDATE
    // weg, kommen 0 Zeilen und KEIN Fehler.
    const { data: updated, error } = await this.client
      .from('event_notes')
      .update({ attachments: remaining })
      .eq('id', noteId)
      .select(NOTE_SELECT)
    if (error) throw new Error(error.message)
    const rows = (updated ?? []) as unknown as EventNoteRow[]
    if (rows.length === 0) {
      throw new Error('Diesen Anhang darf nur der Verfasser oder ein Relationship Manager löschen.')
    }

    // Datei erst nach dem erfolgreichen Schreiben entfernen, best effort.
    if (removed.url) {
      const { fileStore } = await import('@/lib/fileStore')
      await fileStore.remove(removed.url).catch(() => undefined)
    }
    return mapRowToEventNote(rows[0])
  }

  async listEventGuests(eventId: string): Promise<EventGuest[]> {
    const { data, error } = await this.client
      .from('event_guests')
      .select(GUEST_SELECT)
      .eq('event_id', eventId)
      .order('created_at')
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as EventGuestRow[]).map(mapRowToEventGuest)
  }

  async addEventGuest(input: NewEventGuest): Promise<EventGuest> {
    const { data, error } = await this.client
      .from('event_guests')
      .insert({
        event_id: input.eventId,
        name: input.name,
        company: input.company ?? null,
        note: input.note ?? null,
      })
      .select(GUEST_SELECT)
      .single()
    if (error) throw new Error(error.message)
    return mapRowToEventGuest(data as unknown as EventGuestRow)
  }

  async updateEventGuest(id: string, patch: EventGuestPatch): Promise<EventGuest> {
    // Teil-Update wie setAttendee: nur übergebene Spalten, KEIN upsert (der
    // schriebe die ganze Zeile und nullte alles Nichtübergebene).
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.company !== undefined) row.company = patch.company
    if (patch.note !== undefined) row.note = patch.note
    if (Object.keys(row).length > 0) {
      const { error } = await this.client.from('event_guests').update(row).eq('id', id)
      if (error) throw new Error(error.message)
    }
    const { data, error } = await this.client
      .from('event_guests')
      .select(GUEST_SELECT)
      .eq('id', id)
      .single()
    if (error) throw new Error(error.message)
    return mapRowToEventGuest(data as unknown as EventGuestRow)
  }

  async removeEventGuest(id: string): Promise<void> {
    // event_notes.guest_id ON DELETE CASCADE (0028) räumt die Notizen mit ab.
    const { error } = await this.client.from('event_guests').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async promoteGuestToContact(
    guestId: string,
    input: { regionId: string; relationshipManagerId: string },
  ): Promise<Contact> {
    const { data: guestData, error: guestErr } = await this.client
      .from('event_guests')
      .select(GUEST_SELECT)
      .eq('id', guestId)
      .single()
    if (guestErr) throw new Error(guestErr.message)
    const guest = mapRowToEventGuest(guestData as unknown as EventGuestRow)

    // Bestehende createContact-Logik wiederverwenden.
    const contact = await this.createContact({
      fullName: guest.name,
      position: '',
      regionId: input.regionId,
      relationshipManagerId: input.relationshipManagerId,
      company: guest.company,
    })

    const { error: markErr } = await this.client
      .from('event_guests')
      .update({ promoted_contact_id: contact.id })
      .eq('id', guestId)
    if (markErr) throw new Error(markErr.message)

    // Notizen über den Gast an den neuen Kontakt umhängen. Braucht die
    // UPDATE-Policy aus 0028 — sonst greift die Umpflege unter RLS ins Leere.
    const { error: noteErr } = await this.client
      .from('event_notes')
      .update({ contact_id: contact.id, guest_id: null })
      .eq('guest_id', guestId)
    if (noteErr) throw new Error(noteErr.message)

    return contact
  }

  // ---------------------------------------------------------------------------
  // Geschenke (Migration 0036). RLS: alles is_privileged(), keine Region.
  // ---------------------------------------------------------------------------

  async listGiftOccasions(): Promise<GiftOccasion[]> {
    const { data, error } = await this.client
      .from('gift_occasions')
      .select(GIFT_OCCASION_SELECT)
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as GiftOccasionRow[]).map(mapGiftOccasion)
  }

  async createGiftOccasion(input: NewGiftOccasion): Promise<GiftOccasion> {
    const name = input.name.trim()
    if (!name) throw new Error('Der Anlass braucht einen Namen')
    const { data, error } = await this.client
      .from('gift_occasions')
      .insert({ name, kind: input.kind, ship_by: input.shipBy ?? null })
      .select(GIFT_OCCASION_SELECT)
      .single()
    if (error) throw new Error(error.message)
    return mapGiftOccasion(data as unknown as GiftOccasionRow)
  }

  async updateGiftOccasion(id: string, patch: GiftOccasionPatch): Promise<GiftOccasion> {
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new Error('Der Anlass braucht einen Namen')
      row.name = name
    }
    if (patch.shipBy !== undefined) row.ship_by = patch.shipBy || null
    if (Object.keys(row).length > 0) {
      const { error } = await this.client.from('gift_occasions').update(row).eq('id', id)
      if (error) throw new Error(error.message)
    }
    const { data, error } = await this.client
      .from('gift_occasions')
      .select(GIFT_OCCASION_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('Anlass nicht gefunden oder keine Berechtigung')
    return mapGiftOccasion(data as unknown as GiftOccasionRow)
  }

  async deleteGiftOccasion(id: string): Promise<void> {
    await this.deleteAndVerify('gift_occasions', id, 'Anlass konnte nicht gelöscht werden')
  }

  async ensureBirthdayOccasion(): Promise<GiftOccasion> {
    const find = async () => {
      const { data, error } = await this.client
        .from('gift_occasions')
        .select(GIFT_OCCASION_SELECT)
        .eq('kind', 'geburtstag')
        .limit(1)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as unknown as GiftOccasionRow[]
      return rows[0] ? mapGiftOccasion(rows[0]) : undefined
    }
    const existing = await find()
    if (existing) return existing
    try {
      return await this.createGiftOccasion({ name: 'Geburtstage', kind: 'geburtstag' })
    } catch (err) {
      // Wettlauf: der eindeutige Index hat einen zweiten verhindert — dann gilt der erste.
      const raced = await find()
      if (raced) return raced
      throw err
    }
  }

  async listGiftProducts(): Promise<GiftProduct[]> {
    const { data, error } = await this.client
      .from('gift_products')
      .select(GIFT_PRODUCT_SELECT)
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as GiftProductRow[]).map(mapGiftProduct)
  }

  async createGiftProduct(input: NewGiftProduct): Promise<GiftProduct> {
    const name = input.name.trim()
    if (!name) throw new Error('Das Produkt braucht einen Namen')
    const { data, error } = await this.client
      .from('gift_products')
      .insert({
        occasion_id: input.occasionId,
        name,
        description: textOrNull(input.description),
        emoji: textOrNull(input.emoji),
      })
      .select(GIFT_PRODUCT_SELECT)
      .single()
    if (error) throw new Error(error.message)
    return mapGiftProduct(data as unknown as GiftProductRow)
  }

  async updateGiftProduct(id: string, patch: GiftProductPatch): Promise<GiftProduct> {
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new Error('Das Produkt braucht einen Namen')
      row.name = name
    }
    if (patch.description !== undefined) row.description = textOrNull(patch.description)
    if (patch.emoji !== undefined) row.emoji = textOrNull(patch.emoji)
    if (Object.keys(row).length > 0) {
      const { error } = await this.client.from('gift_products').update(row).eq('id', id)
      if (error) throw new Error(error.message)
    }
    const { data, error } = await this.client
      .from('gift_products')
      .select(GIFT_PRODUCT_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('Produkt nicht gefunden oder keine Berechtigung')
    return mapGiftProduct(data as unknown as GiftProductRow)
  }

  async deleteGiftProduct(id: string): Promise<void> {
    await this.deleteAndVerify('gift_products', id, 'Produkt konnte nicht gelöscht werden')
  }

  async listGiftSenders(): Promise<GiftSender[]> {
    const { data, error } = await this.client
      .from('gift_senders')
      .select(GIFT_SENDER_SELECT)
      .order('name', { ascending: true })
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as GiftSenderRow[]).map(mapGiftSender)
  }

  async createGiftSender(name: string, isCLevel = false): Promise<GiftSender> {
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (!trimmed) throw new Error('Der Absender braucht einen Namen')
    const find = async () => {
      const pattern = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)
      const { data, error } = await this.client
        .from('gift_senders')
        .select(GIFT_SENDER_SELECT)
        .ilike('name', pattern)
        .limit(1)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as unknown as GiftSenderRow[]
      return rows[0] ? mapGiftSender(rows[0]) : undefined
    }
    const existing = await find()
    if (existing) return existing
    const { data, error } = await this.client
      .from('gift_senders')
      .insert({ name: trimmed, is_c_level: isCLevel })
      .select(GIFT_SENDER_SELECT)
      .single()
    if (error) {
      const raced = await find()
      if (raced) return raced
      throw new Error(error.message)
    }
    return mapGiftSender(data as unknown as GiftSenderRow)
  }

  async updateGiftSender(id: string, patch: { name?: string; isCLevel?: boolean }): Promise<GiftSender> {
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) {
      const name = patch.name.trim().replace(/\s+/g, ' ')
      if (!name) throw new Error('Der Absender braucht einen Namen')
      row.name = name
    }
    if (patch.isCLevel !== undefined) row.is_c_level = patch.isCLevel
    if (Object.keys(row).length > 0) {
      const { error } = await this.client.from('gift_senders').update(row).eq('id', id)
      if (error) throw new Error(error.message)
    }
    const { data, error } = await this.client
      .from('gift_senders')
      .select(GIFT_SENDER_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('Absender nicht gefunden oder keine Berechtigung')
    return mapGiftSender(data as unknown as GiftSenderRow)
  }

  async deleteGiftSender(id: string): Promise<void> {
    await this.deleteAndVerify('gift_senders', id, 'Absender konnte nicht gelöscht werden')
  }

  /** Absender-Zuordnungen, gruppiert je Empfänger. Ohne Filter = alle (seitenweise). */
  private async giftSenderLinks(recipientIds?: string[]): Promise<Map<string, string[]>> {
    const rows: { recipient_id: string; sender_id: string }[] = []
    if (recipientIds) {
      for (const part of chunk(recipientIds, 50)) {
        const { data, error } = await this.client
          .from('gift_recipient_senders')
          .select('recipient_id, sender_id')
          .in('recipient_id', part)
        if (error) throw new Error(error.message)
        rows.push(...((data ?? []) as { recipient_id: string; sender_id: string }[]))
      }
    } else {
      rows.push(
        ...(await fetchAllPages<{ recipient_id: string; sender_id: string }>((from, to) =>
          this.client
            .from('gift_recipient_senders')
            .select('recipient_id, sender_id')
            .order('recipient_id', { ascending: true })
            .range(from, to),
        )),
      )
    }
    const byRecipient = new Map<string, string[]>()
    for (const l of rows) {
      byRecipient.set(l.recipient_id, [...(byRecipient.get(l.recipient_id) ?? []), l.sender_id])
    }
    return byRecipient
  }

  async listGiftRecipients(): Promise<GiftRecipient[]> {
    const [rows, links] = await Promise.all([
      fetchAllPages<GiftRecipientRow>((from, to) =>
        this.client
          .from('gift_recipients')
          .select(GIFT_RECIPIENT_SELECT)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      ),
      this.giftSenderLinks(),
    ])
    return rows.map((r) => mapGiftRecipient(r, links.get(r.id) ?? []))
  }

  async listContactGifts(contactId: string): Promise<GiftRecipient[]> {
    const { data, error } = await this.client
      .from('gift_recipients')
      .select(GIFT_RECIPIENT_SELECT)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as GiftRecipientRow[]
    const links = await this.giftSenderLinks(rows.map((r) => r.id))
    return rows.map((r) => mapGiftRecipient(r, links.get(r.id) ?? []))
  }

  private async getGiftRecipient(id: string): Promise<GiftRecipient> {
    const { data, error } = await this.client
      .from('gift_recipients')
      .select(GIFT_RECIPIENT_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('Empfänger nicht gefunden oder keine Berechtigung')
    const links = await this.giftSenderLinks([id])
    return mapGiftRecipient(data as unknown as GiftRecipientRow, links.get(id) ?? [])
  }

  private async writeGiftSenderLinks(recipientId: string, senderIds: string[]): Promise<void> {
    const { error: delError } = await this.client
      .from('gift_recipient_senders')
      .delete()
      .eq('recipient_id', recipientId)
    if (delError) throw new Error(delError.message)
    const unique = [...new Set(senderIds)]
    if (unique.length === 0) return
    const { error } = await this.client
      .from('gift_recipient_senders')
      .insert(unique.map((sender_id) => ({ recipient_id: recipientId, sender_id })))
    if (error) throw new Error(error.message)
  }

  async createGiftRecipient(input: NewGiftRecipient): Promise<GiftRecipient> {
    // Die ID vergibt der Browser — so hängen die Absender sicher an der richtigen
    // Zeile, ohne sich auf die Reihenfolge einer RETURNING-Liste zu verlassen.
    const id = crypto.randomUUID()
    const { error } = await this.client.from('gift_recipients').insert(recipientRow(input, id))
    if (error) throw new Error(error.message)
    await this.writeGiftSenderLinks(id, input.senderIds)
    return this.getGiftRecipient(id)
  }

  async updateGiftRecipient(id: string, patch: GiftRecipientPatch): Promise<GiftRecipient> {
    const row: Record<string, unknown> = {}
    const text: [keyof GiftRecipientPatch, string][] = [
      ['firstName', 'first_name'],
      ['lastName', 'last_name'],
      ['company', 'company'],
      ['street', 'street'],
      ['postalCode', 'postal_code'],
      ['city', 'city'],
      ['country', 'country'],
      ['note', 'note'],
    ]
    for (const [key, col] of text) {
      if (patch[key] !== undefined) row[col] = textOrNull(patch[key] as string | null)
    }
    if (patch.productId !== undefined) row.product_id = patch.productId || null
    if (patch.contactId !== undefined) row.contact_id = patch.contactId || null
    if (patch.shipping !== undefined) row.shipping = patch.shipping
    if (patch.status !== undefined) row.status = patch.status
    // KEIN upsert (Fallstrick 1): gezielt ändern, dann neu lesen.
    if (Object.keys(row).length > 0) {
      const { error } = await this.client.from('gift_recipients').update(row).eq('id', id)
      if (error) throw new Error(error.message)
    }
    if (patch.senderIds !== undefined) await this.writeGiftSenderLinks(id, patch.senderIds)
    return this.getGiftRecipient(id)
  }

  async setGiftStatus(ids: string[], status: GiftStatus): Promise<number> {
    let matched = 0
    for (const part of chunk([...new Set(ids)], 50)) {
      const { data, error } = await this.client
        .from('gift_recipients')
        .update({ status })
        .in('id', part)
        .select('id')
      if (error) throw new Error(error.message)
      matched += ((data ?? []) as { id: string }[]).length
    }
    return matched
  }

  async deleteGiftRecipient(id: string): Promise<void> {
    await this.deleteAndVerify('gift_recipients', id, 'Empfänger konnte nicht gelöscht werden')
  }

  async importGiftRecipients(rows: NewGiftRecipient[]): Promise<number> {
    const withIds = rows.map((r) => ({ input: r, id: crypto.randomUUID() }))
    for (const part of chunk(withIds, 100)) {
      const { error } = await this.client
        .from('gift_recipients')
        .insert(part.map(({ input, id }) => recipientRow(input, id)))
      if (error) throw new Error(error.message)
    }
    const links = withIds.flatMap(({ input, id }) =>
      [...new Set(input.senderIds)].map((sender_id) => ({ recipient_id: id, sender_id })),
    )
    for (const part of chunk(links, 200)) {
      const { error } = await this.client.from('gift_recipient_senders').insert(part)
      if (error) throw new Error(error.message)
    }
    return withIds.length
  }

  /**
   * Löschen und nachprüfen: eine von der RLS gefilterte Löschung liefert 0
   * Zeilen und KEINEN Fehler. Was es nicht (mehr) gibt, ist dagegen kein
   * Fehler — wie ein DELETE in Postgres.
   */
  private async deleteAndVerify(table: string, id: string, failure: string): Promise<void> {
    const { error } = await this.client.from(table).delete().eq('id', id)
    if (error) throw new Error(error.message)
    const { data, error: readError } = await this.client.from(table).select('id').eq('id', id)
    if (readError) throw new Error(readError.message)
    if (((data ?? []) as unknown[]).length > 0) throw new Error(failure)
  }
}
