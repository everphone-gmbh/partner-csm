import type {
  Activity,
  AppUser,
  AuditEntry,
  Contact,
  ContactLink,
  EventGuest,
  EventItem,
  EventNote,
  GiftOccasion,
  GiftProduct,
  GiftRecipient,
  GiftSender,
  GiftStatus,
  IntroRequest,
  OrgUnit,
  Region,
  Reminder,
  Role,
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
import {
  seedActivities,
  seedContactLinks,
  seedIntroRequests,
  seedContacts,
  seedEventAttendees,
  seedEventNotes,
  seedEvents,
  seedGiftOccasions,
  seedGiftProducts,
  seedGiftRecipients,
  seedGiftSenders,
  seedReminders,
  seedOrgUnits,
  seedPendingAccounts,
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
  private pendingAccounts = clone(seedPendingAccounts)
  private contacts = clone(seedContacts)
  private activities = clone(seedActivities)
  private events = clone(seedEvents)
  private attendees = clone(seedEventAttendees)
  private eventNotes = clone(seedEventNotes)
  private guests: EventGuest[] = []
  private reminders = clone(seedReminders)
  private links = clone(seedContactLinks)
  private introRequests = clone(seedIntroRequests)
  private orgUnits: OrgUnit[] = clone(seedOrgUnits)
  // Favoriten sind pro Nutzer (Migration 0031); der Mock hält sie wie die
  // Tabelle als (profileId, contactId)-Paare.
  private favorites: { profileId: string; contactId: string }[] = []
  // Geschenke (0036) — erfundene Demo-Daten, Aufbau wie das echte Sheet.
  private giftOccasions: GiftOccasion[] = clone(seedGiftOccasions)
  private giftProducts: GiftProduct[] = clone(seedGiftProducts)
  private giftSenders: GiftSender[] = clone(seedGiftSenders)
  private giftRecipients: GiftRecipient[] = clone(seedGiftRecipients)
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

  /** Finden ODER anlegen — siehe supabaseRepository.createRegion. Beide Zweige
   *  müssen sich gleich verhalten, der Contract-Test prüft genau das. */
  async createRegion(name: string) {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Regionsname darf nicht leer sein')
    const existing = this.regions.find(
      (r) => r.name.toLowerCase() === trimmed.toLowerCase(),
    )
    if (existing) return clone(existing)
    const region: Region = {
      id: `region-local-${this.seq++}`,
      name: trimmed,
      isPlaceholder: false,
    }
    this.regions.push(region)
    return clone(region)
  }

  async renameRegion(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Regionsname darf nicht leer sein')
    const idx = this.regions.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error(`region ${id} not found`)
    // Nur den Namen ändern; das Platzhalter-Kennzeichen bleibt, wie es ist.
    this.regions[idx] = { ...this.regions[idx], name: trimmed }
    return clone(this.regions[idx])
  }

  async deleteRegion(id: string) {
    const idx = this.regions.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error(`region ${id} not found`)
    // Gleiche Schutzregeln wie die echte Datenbank: der Platzhalter ist über
    // die Delete-Policy (0030) unantastbar, benutzte Gebiete blocken die FKs
    // auf contacts.region_id / profiles.region_id.
    if (this.regions[idx].isPlaceholder) {
      throw new Error('Region ist geschützt und wurde nicht gelöscht.')
    }
    const used =
      this.contacts.some((c) => c.regionId === id) || this.users.some((u) => u.regionId === id)
    if (used) {
      throw new Error('Region wird noch verwendet — erst Kontakte/Nutzer umziehen, dann löschen.')
    }
    this.regions.splice(idx, 1)
  }

  /** Spiegelt 0035: die Menge wird ersetzt, das führende Gebiet bleibt, solange
   *  es Mitglied bleibt — sonst rückt das erste verbliebene nach. */
  async setContactRegions(contactId: string, regionIds: string[]) {
    const wanted = [...new Set(regionIds.filter(Boolean))]
    if (wanted.length === 0) throw new Error('Mindestens ein Gebiet ist nötig')
    const idx = this.contacts.findIndex((c) => c.id === contactId)
    if (idx < 0) throw new Error('Kontakt nicht gefunden oder keine Berechtigung')
    const current = this.contacts[idx]
    const leading = wanted.includes(current.regionId) ? current.regionId : wanted[0]
    this.contacts[idx] = { ...current, regionId: leading, regionIds: wanted }
    this.audit('update', 'contact_region', contactId)
    return clone(this.contacts[idx])
  }

  /** Spiegelt merge_contacts() aus 0038 — vereinen statt ersetzen, Verlierer weg. */
  async mergeContacts(winnerId: string, loserId: string, patch: ContactPatch = {}) {
    if (winnerId === loserId) throw new Error('Ein Kontakt lässt sich nicht mit sich selbst zusammenführen')
    const loser = this.contacts.find((c) => c.id === loserId)
    if (!loser || !this.contacts.some((c) => c.id === winnerId)) {
      throw new Error('Kontakt nicht gefunden oder keine Berechtigung')
    }
    const fieldPatch: ContactPatch = { ...patch }
    delete fieldPatch.sideFacts
    delete fieldPatch.gallery
    delete fieldPatch.customers
    delete fieldPatch.regionIds
    if (Object.keys(fieldPatch).length > 0) await this.updateContact(winnerId, fieldPatch)

    const move = <T extends { contactId?: string }>(rows: T[]) =>
      rows.map((r) => (r.contactId === loserId ? { ...r, contactId: winnerId } : r))
    this.activities = move(this.activities)
    this.reminders = move(this.reminders)
    this.eventNotes = move(this.eventNotes)
    this.giftRecipients = move(this.giftRecipients)
    this.guests = this.guests.map((g) =>
      g.promotedContactId === loserId ? { ...g, promotedContactId: winnerId } : g,
    )

    const idx = this.contacts.findIndex((c) => c.id === winnerId)
    const w = this.contacts[idx]
    const labels = new Set(w.sideFacts.map((f) => f.label.trim().toLowerCase()))
    const customerIds = new Set(w.customers.map((c) => c.id))
    this.contacts[idx] = {
      ...w,
      gallery: [...(w.gallery ?? []), ...(loser.gallery ?? [])],
      sideFacts: [
        ...w.sideFacts,
        ...loser.sideFacts.filter((f) => !labels.has(f.label.trim().toLowerCase())),
      ],
      customers: [...w.customers, ...loser.customers.filter((c) => !customerIds.has(c.id))],
      regionIds: [...new Set([...(w.regionIds ?? [w.regionId]), ...(loser.regionIds ?? [loser.regionId])])],
    }

    const winnerEvents = new Set(
      this.attendees.filter((a) => a.contactId === winnerId).map((a) => a.eventId),
    )
    this.attendees = this.attendees
      .filter((a) => !(a.contactId === loserId && winnerEvents.has(a.eventId)))
      .map((a) => (a.contactId === loserId ? { ...a, contactId: winnerId } : a))

    const favKeys = new Set(this.favorites.filter((f) => f.contactId === winnerId).map((f) => f.profileId))
    this.favorites = this.favorites
      .filter((f) => !(f.contactId === loserId && favKeys.has(f.profileId)))
      .map((f) => (f.contactId === loserId ? { ...f, contactId: winnerId } : f))

    // Verbindungen zwischen den beiden weg, Rest umhängen, Doppel entfernen.
    const pair = new Set([winnerId, loserId])
    const seen = new Set<string>()
    this.links = this.links
      .filter((l) => !(pair.has(l.fromContactId) && pair.has(l.toContactId)))
      .map((l) => ({
        ...l,
        fromContactId: l.fromContactId === loserId ? winnerId : l.fromContactId,
        toContactId: l.toContactId === loserId ? winnerId : l.toContactId,
      }))
      .filter((l) => {
        const key = `${l.fromContactId}|${l.toContactId}|${l.kind}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

    this.contacts = this.contacts.filter((c) => c.id !== loserId)
    this.audit('delete', 'contact', loserId)
    return clone(this.contacts.find((c) => c.id === winnerId)!)
  }

  async listUsers() {
    return clone(this.users)
  }

  async updateUser(id: string, patch: { role?: Role; regionId?: string | null }) {
    const idx = this.users.findIndex((u) => u.id === id)
    if (idx < 0) throw new Error('Konto nicht gefunden.')
    const current = this.users[idx]

    // Leerer Patch: kein Schreibzugriff, unveränderter Stand zurück — genau wie
    // im Supabase-Adapter, wo PostgREST einen leeren PATCH-Rumpf ablehnt.
    if (patch.role === undefined && patch.regionId === undefined) return clone(current)

    // Sperren des Triggers profiles_guard_change (Migration 0033) nachbilden,
    // damit der Demo-Modus sich verhält wie die Produktion.
    //
    // NICHT nachgebildet ist die dritte Sperre — „niemand ändert die EIGENE
    // Rolle". Sie hängt an auth.uid(); das Repository kennt bewusst keine
    // Sitzung (auch die Favoriten bekommen ihre profileId von außen gereicht),
    // und im Demo-Modus lässt sich die Rolle jederzeit umschalten, ein fest
    // verdrahteter „das bin ich" wäre also schlicht falsch. Serverseitig
    // greift der Trigger, in der Oberfläche ist das eigene Rollenfeld
    // deaktiviert.
    if (patch.role !== undefined && patch.role !== current.role) {
      const admins = this.users.filter((u) => u.role === 'overall_admin').length
      if (current.role === 'overall_admin' && admins <= 1) {
        throw new Error('Der letzte Administrator kann nicht herabgestuft werden')
      }
    }

    const next: AppUser = { ...current }
    if (patch.role !== undefined) next.role = patch.role
    if (patch.regionId !== undefined) next.regionId = patch.regionId ?? undefined

    // Nur geänderte Felder protokollieren, und nur die Feldnamen — wie der
    // Trigger profiles_audit (0033 → log_data_change aus 0019) es tut.
    const fields: string[] = []
    if (next.role !== current.role) fields.push('role')
    if (next.regionId !== current.regionId) fields.push('region_id')

    this.users[idx] = next
    if (fields.length > 0) this.audit('update', 'profile', id, fields.sort())
    return clone(next)
  }

  async listPendingAccounts() {
    return clone(this.pendingAccounts)
  }

  async approveAccount(id: string, role: Role, regionId?: string) {
    // Dieselben Regeln wie approve_account() (0040), in derselben Reihenfolge.
    if (this.users.some((u) => u.id === id)) throw new Error('Das Konto ist bereits freigeschaltet')
    const pending = this.pendingAccounts.find((p) => p.id === id)
    if (!pending) throw new Error('Konto nicht gefunden')
    if (role === 'account_manager' && !regionId) throw new Error('Account Manager brauchen eine Region')
    const user: AppUser = { id, name: pending.name, role, regionId: regionId || undefined }
    this.users.push(user)
    this.pendingAccounts = this.pendingAccounts.filter((p) => p.id !== id)
    this.audit('insert', 'profile', id)
    return clone(user)
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
      // Wie der Trigger contacts_region_membership (0035): ein neuer Kontakt
      // bekommt sein Gebiet sofort als Zuordnung, sonst ist er unsichtbar.
      regionIds: [input.regionId],
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
    if (patch.regionIds !== undefined) await this.setContactRegions(id, patch.regionIds)
    const idx = this.contacts.findIndex((c) => c.id === id)
    if (idx < 0) throw new Error(`contact ${id} not found`)
    const before = this.contacts[idx]
    const fields = (Object.keys(patch) as (keyof ContactPatch)[]).filter(
      (k) => JSON.stringify(patch[k]) !== JSON.stringify(before[k as keyof Contact]),
    )
    const next: Contact = { ...before, ...(patch as Partial<Contact>), updatedAt: nowIso() }
    // null nimmt die Einordnung zurück; im Domänenmodell heißt das undefined.
    if (patch.hierarchyLevel === null) next.hierarchyLevel = undefined
    if (patch.additionalCompanies !== undefined) {
      const list = patch.additionalCompanies.map((c) => c.trim()).filter(Boolean)
      next.additionalCompanies = list.length ? list : undefined
    }
    this.contacts[idx] = next
    if (fields.length > 0) this.audit('update', 'contact', id, fields as string[])
    return clone(this.contacts[idx])
  }

  /**
   * Kontaktfoto setzen oder entfernen. Produktiv läuft das über die Funktion
   * `set_contact_photo` (Migration 0032), damit auch Account Manager es dürfen;
   * hier genügt das Setzen der Spalte.
   *
   * Die Pfadkonvention `storage:contact-avatars/<id>/…` prüft der Mock bewusst
   * NICHT: im Demo-Modus liefert der fileStore Data-URLs (`data:image/…`), eine
   * Prüfung würde also genau den Weg blockieren, den die Demo nimmt. Erzwungen
   * wird sie dort, wo sie sicherheitsrelevant ist — in der Datenbank.
   */
  async setContactPhoto(contactId: string, photoUrl: string | null) {
    const idx = this.contacts.findIndex((c) => c.id === contactId)
    if (idx < 0) throw new Error(`contact ${contactId} not found`)
    const before = this.contacts[idx]
    const changed = (before.photoUrl ?? null) !== photoUrl
    this.contacts[idx] = { ...before, photoUrl, updatedAt: nowIso() }
    // Wie updateContact: nur eine echte Änderung wird protokolliert.
    if (changed) this.audit('update', 'contact', contactId, ['photoUrl'])
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
    // favorites.contact_id ON DELETE CASCADE (0031): die Sterne aller Nutzer gehen mit.
    this.favorites = this.favorites.filter((f) => f.contactId !== id)
    // gift_recipients.contact_id ON DELETE CASCADE (0036): Recht auf Vergessenwerden.
    this.giftRecipients = this.giftRecipients.filter((r) => r.contactId !== id)
    // event_guests.promoted_contact_id ist ON DELETE SET NULL: der Gast bleibt als
    // Messe-Historie erhalten, verliert aber den Verweis auf den gelöschten Kontakt.
    this.guests = this.guests.map((g) =>
      g.promotedContactId === id ? { ...g, promotedContactId: undefined } : g,
    )
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
      if (patch.regionId !== undefined) {
        const current = c.regionIds ?? [c.regionId]
        if (patch.regionMode === 'add') {
          // Hinzufügen: führendes Gebiet bleibt, die Menge wächst.
          if (!current.includes(patch.regionId)) {
            next.regionIds = [...current, patch.regionId]
            fields.push('contact_regions')
          }
        } else {
          if (patch.regionId !== c.regionId) fields.push('region_id')
          if (current.length !== 1 || current[0] !== patch.regionId) {
            if (!fields.includes('region_id')) fields.push('contact_regions')
          }
          next.regionId = patch.regionId
          next.regionIds = [patch.regionId]
        }
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

  /** Spiegelt 0034: nur der Text ändert sich, `editedAt` setzt der Speicher
   *  selbst, und ein unveränderter Text markiert den Eintrag nicht. */
  async updateActivity(id: string, body: string) {
    const trimmed = body.trim()
    if (!trimmed) throw new Error('Der Text darf nicht leer sein')
    const idx = this.activities.findIndex((a) => a.id === id)
    if (idx < 0) throw new Error('Eintrag nicht gefunden oder keine Berechtigung')
    const before = this.activities[idx]
    const changed = before.body !== trimmed
    this.activities[idx] = {
      ...before,
      body: trimmed,
      aiSummary: localSummarizer.activitySummary({ type: before.type, body: trimmed }),
      editedAt: changed ? new Date().toISOString() : before.editedAt,
    }
    return clone(this.activities[idx])
  }

  /** Idempotent wie ein DELETE in Postgres: was nicht da ist, ist kein Fehler.
   *  Der Supabase-Zweig kann beides gar nicht unterscheiden. */
  async removeActivity(id: string) {
    const idx = this.activities.findIndex((a) => a.id === id)
    if (idx < 0) return
    this.activities.splice(idx, 1)
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

  async listOrgUnitNames() {
    const seen = new Set<string>()
    return this.orgUnits
      .map((u) => ({ company: u.company, department: u.department, team: u.team }))
      .filter((u) => {
        const key = `${u.company}|${u.department}|${u.team ?? ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }

  async createOrgUnit(input: { company: string; department: string; team?: string; note?: string }) {
    const company = input.company.trim()
    const department = input.department.trim()
    if (!company || !department) throw new Error('Firma und Abteilung sind Pflicht')
    const unit: OrgUnit = {
      id: `ou-local-${this.seq++}`,
      company,
      department,
      team: input.team?.trim() || null,
      note: input.note?.trim() || undefined,
    }
    this.orgUnits.push(unit)
    return clone(unit)
  }

  async updateOrgUnit(
    id: string,
    patch: { company?: string; department?: string; team?: string | null; note?: string | null },
  ) {
    const idx = this.orgUnits.findIndex((u) => u.id === id)
    if (idx < 0) throw new Error('Einheit nicht gefunden oder keine Berechtigung')
    const next = { ...this.orgUnits[idx] }
    if (patch.company !== undefined) {
      if (!patch.company.trim()) throw new Error('Firma und Abteilung sind Pflicht')
      next.company = patch.company.trim()
    }
    if (patch.department !== undefined) {
      if (!patch.department.trim()) throw new Error('Firma und Abteilung sind Pflicht')
      next.department = patch.department.trim()
    }
    if (patch.team !== undefined) next.team = patch.team?.trim() || null
    if (patch.note !== undefined) next.note = patch.note?.trim() || undefined
    this.orgUnits[idx] = next
    return clone(next)
  }

  async deleteOrgUnit(id: string) {
    this.orgUnits = this.orgUnits.filter((u) => u.id !== id)
  }

  async listFavorites(profileId: string) {
    return this.favorites.filter((f) => f.profileId === profileId).map((f) => f.contactId)
  }

  async addFavorite(profileId: string, contactId: string) {
    // Idempotent wie der zusammengesetzte Primärschlüssel in Postgres (0031).
    if (this.favorites.some((f) => f.profileId === profileId && f.contactId === contactId)) return
    this.favorites.push({ profileId, contactId })
  }

  async removeFavorite(profileId: string, contactId: string) {
    this.favorites = this.favorites.filter(
      (f) => !(f.profileId === profileId && f.contactId === contactId),
    )
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
      authorId: input.authorId,
      createdAt: nowIso(),
      attachments: input.attachments,
      contactId: input.contactId,
      guestId: input.guestId,
    }
    this.eventNotes.push(note)
    return clone(note)
  }

  async deleteEventNote(id: string) {
    // Keine Rechteprüfung: im Demo-Modus gibt es keine Sitzung, und die echte
    // Entscheidung trifft ohnehin die Policy `event_notes_delete`. Eine
    // unbekannte ID ist wie im Supabase-Zweig ein stiller Nicht-Treffer.
    this.eventNotes = this.eventNotes.filter((n) => n.id !== id)
  }

  async removeEventNoteAttachment(noteId: string, attachmentId: string) {
    const idx = this.eventNotes.findIndex((n) => n.id === noteId)
    if (idx < 0) throw new Error(`event note ${noteId} not found`)
    // Unbekannte Anhang-ID lässt die Notiz unverändert — gleiche Zusage wie im
    // Supabase-Zweig. Die Dateien liegen hier als Data-URL in der Notiz selbst,
    // ein Aufräumen in der Ablage gibt es im Mock deshalb nicht.
    const next = {
      ...this.eventNotes[idx],
      attachments: this.eventNotes[idx].attachments.filter((a) => a.id !== attachmentId),
    }
    this.eventNotes[idx] = next
    return clone(next)
  }

  async listEventGuests(eventId: string) {
    return clone(this.guests.filter((g) => g.eventId === eventId))
  }

  async addEventGuest(input: NewEventGuest) {
    const guest: EventGuest = {
      id: `eg-local-${this.seq++}`,
      eventId: input.eventId,
      name: input.name,
      company: input.company,
      note: input.note,
    }
    this.guests.push(guest)
    return clone(guest)
  }

  async updateEventGuest(id: string, patch: EventGuestPatch) {
    const idx = this.guests.findIndex((g) => g.id === id)
    if (idx < 0) throw new Error(`event guest ${id} not found`)
    // Feldweises Update wie setAttendee: nur übergebene Schlüssel schreiben.
    const next = { ...this.guests[idx] }
    if (patch.name !== undefined) next.name = patch.name
    if (patch.company !== undefined) next.company = patch.company
    if (patch.note !== undefined) next.note = patch.note
    this.guests[idx] = next
    return clone(next)
  }

  async removeEventGuest(id: string) {
    // Spiegelt event_notes.guest_id ON DELETE CASCADE (Migration 0028).
    this.guests = this.guests.filter((g) => g.id !== id)
    this.eventNotes = this.eventNotes.filter((n) => n.guestId !== id)
  }

  async promoteGuestToContact(
    guestId: string,
    input: { regionId: string; relationshipManagerId: string },
  ) {
    const guest = this.guests.find((g) => g.id === guestId)
    if (!guest) throw new Error(`event guest ${guestId} not found`)
    // Bestehende createContact-Logik wiederverwenden (Audit inklusive).
    const contact = await this.createContact({
      fullName: guest.name,
      position: '',
      regionId: input.regionId,
      relationshipManagerId: input.relationshipManagerId,
      company: guest.company,
    })
    const idx = this.guests.findIndex((g) => g.id === guestId)
    this.guests[idx] = { ...this.guests[idx], promotedContactId: contact.id }
    // Notizen über den Gast an den neuen Kontakt umhängen (guest_id → contact_id).
    this.eventNotes = this.eventNotes.map((n) =>
      n.guestId === guestId ? { ...n, contactId: contact.id, guestId: undefined } : n,
    )
    return contact
  }
  // ---------------------------------------------------------------------------
  // Geschenke (0036) — dieselben Riegel wie die Datenbank, damit der
  // Contract-Test beide Zweige gegeneinander halten kann.
  // ---------------------------------------------------------------------------

  async listGiftOccasions() {
    return clone(this.giftOccasions)
  }

  async createGiftOccasion(input: NewGiftOccasion) {
    const name = input.name.trim()
    if (!name) throw new Error('Der Anlass braucht einen Namen')
    if (input.kind === 'geburtstag' && this.giftOccasions.some((o) => o.kind === 'geburtstag')) {
      throw new Error('duplicate key value violates unique constraint "gift_occasions_one_birthday"')
    }
    const occasion: GiftOccasion = {
      id: `go-local-${this.seq++}`,
      name,
      kind: input.kind,
      shipBy: input.shipBy,
      createdAt: nowIso(),
    }
    this.giftOccasions.push(occasion)
    return clone(occasion)
  }

  async updateGiftOccasion(id: string, patch: GiftOccasionPatch) {
    const idx = this.giftOccasions.findIndex((o) => o.id === id)
    if (idx < 0) throw new Error('Anlass nicht gefunden oder keine Berechtigung')
    const next = { ...this.giftOccasions[idx] }
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new Error('Der Anlass braucht einen Namen')
      next.name = name
    }
    if (patch.shipBy !== undefined) next.shipBy = patch.shipBy || undefined
    this.giftOccasions[idx] = next
    return clone(next)
  }

  async deleteGiftOccasion(id: string) {
    this.giftOccasions = this.giftOccasions.filter((o) => o.id !== id)
    this.giftProducts = this.giftProducts.filter((p) => p.occasionId !== id)
    this.giftRecipients = this.giftRecipients.filter((r) => r.occasionId !== id)
  }

  async ensureBirthdayOccasion() {
    const existing = this.giftOccasions.find((o) => o.kind === 'geburtstag')
    if (existing) return clone(existing)
    return this.createGiftOccasion({ name: 'Geburtstage', kind: 'geburtstag' })
  }

  async listGiftProducts() {
    return clone(this.giftProducts)
  }

  async createGiftProduct(input: NewGiftProduct) {
    const name = input.name.trim()
    if (!name) throw new Error('Das Produkt braucht einen Namen')
    const product: GiftProduct = {
      id: `gp-local-${this.seq++}`,
      occasionId: input.occasionId,
      name,
      description: input.description?.trim() || undefined,
      emoji: input.emoji?.trim() || undefined,
    }
    this.giftProducts.push(product)
    return clone(product)
  }

  async updateGiftProduct(id: string, patch: GiftProductPatch) {
    const idx = this.giftProducts.findIndex((p) => p.id === id)
    if (idx < 0) throw new Error('Produkt nicht gefunden oder keine Berechtigung')
    const next = { ...this.giftProducts[idx] }
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new Error('Das Produkt braucht einen Namen')
      next.name = name
    }
    if (patch.description !== undefined) next.description = patch.description?.trim() || undefined
    if (patch.emoji !== undefined) next.emoji = patch.emoji?.trim() || undefined
    this.giftProducts[idx] = next
    return clone(next)
  }

  async deleteGiftProduct(id: string) {
    this.giftProducts = this.giftProducts.filter((p) => p.id !== id)
    // product_id ON DELETE SET NULL: der Empfänger bleibt, ohne Produkt.
    this.giftRecipients = this.giftRecipients.map((r) =>
      r.productId === id ? { ...r, productId: undefined } : r,
    )
  }

  async listGiftSenders() {
    return clone([...this.giftSenders].sort((a, b) => a.name.localeCompare(b.name)))
  }

  async createGiftSender(name: string, isCLevel = false) {
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (!trimmed) throw new Error('Der Absender braucht einen Namen')
    const existing = this.giftSenders.find((s) => s.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) return clone(existing)
    const sender: GiftSender = { id: `gs-local-${this.seq++}`, name: trimmed, isCLevel }
    this.giftSenders.push(sender)
    return clone(sender)
  }

  async updateGiftSender(id: string, patch: { name?: string; isCLevel?: boolean }) {
    const idx = this.giftSenders.findIndex((s) => s.id === id)
    if (idx < 0) throw new Error('Absender nicht gefunden oder keine Berechtigung')
    const next = { ...this.giftSenders[idx] }
    if (patch.name !== undefined) {
      const name = patch.name.trim().replace(/\s+/g, ' ')
      if (!name) throw new Error('Der Absender braucht einen Namen')
      if (this.giftSenders.some((s) => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('duplicate key value violates unique constraint "gift_senders_name_key"')
      }
      next.name = name
    }
    if (patch.isCLevel !== undefined) next.isCLevel = patch.isCLevel
    this.giftSenders[idx] = next
    return clone(next)
  }

  async deleteGiftSender(id: string) {
    this.giftSenders = this.giftSenders.filter((s) => s.id !== id)
    this.giftRecipients = this.giftRecipients.map((r) => ({
      ...r,
      senderIds: r.senderIds.filter((sid) => sid !== id),
    }))
  }

  async listGiftRecipients() {
    return clone(this.giftRecipients)
  }

  async listContactGifts(contactId: string) {
    return clone(
      this.giftRecipients
        .filter((r) => r.contactId === contactId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    )
  }

  /** Die Riegel aus 0036: jemand muss benannt sein, das Produkt zum Anlass passen. */
  private checkGiftRecipient(r: GiftRecipient) {
    if (!r.firstName?.trim() && !r.lastName?.trim() && !r.company?.trim()) {
      throw new Error('new row violates check constraint "gift_recipients_names_someone"')
    }
    if (r.productId && !this.giftProducts.some((p) => p.id === r.productId && p.occasionId === r.occasionId)) {
      throw new Error('Das Produkt gehört zu einem anderen Anlass')
    }
  }

  private buildRecipient(input: NewGiftRecipient): GiftRecipient {
    const t = (v?: string) => v?.trim() || undefined
    return {
      id: `gr-local-${this.seq++}`,
      occasionId: input.occasionId,
      productId: input.productId,
      contactId: input.contactId,
      firstName: t(input.firstName),
      lastName: t(input.lastName),
      company: t(input.company),
      street: t(input.street),
      postalCode: t(input.postalCode),
      city: t(input.city),
      country: t(input.country),
      shipping: input.shipping ?? 'direkt',
      status: input.status ?? 'geplant',
      statusAt: input.statusAt,
      note: t(input.note),
      senderIds: [...new Set(input.senderIds)],
      createdAt: nowIso(),
    }
  }

  async createGiftRecipient(input: NewGiftRecipient) {
    const r = this.buildRecipient(input)
    this.checkGiftRecipient(r)
    this.giftRecipients.push(r)
    this.audit('insert', 'gift_recipient', r.id)
    return clone(r)
  }

  async updateGiftRecipient(id: string, patch: GiftRecipientPatch) {
    const idx = this.giftRecipients.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error('Empfänger nicht gefunden oder keine Berechtigung')
    const before = this.giftRecipients[idx]
    const next: GiftRecipient = { ...before }
    const text = ['firstName', 'lastName', 'company', 'street', 'postalCode', 'city', 'country', 'note'] as const
    for (const key of text) {
      if (patch[key] !== undefined) next[key] = patch[key]?.trim() || undefined
    }
    if (patch.productId !== undefined) next.productId = patch.productId || undefined
    if (patch.contactId !== undefined) next.contactId = patch.contactId || undefined
    if (patch.shipping !== undefined) next.shipping = patch.shipping
    if (patch.status !== undefined && patch.status !== before.status) {
      next.status = patch.status
      next.statusAt = nowIso()
    }
    if (patch.senderIds !== undefined) next.senderIds = [...new Set(patch.senderIds)]
    this.checkGiftRecipient(next)
    this.giftRecipients[idx] = next
    this.audit('update', 'gift_recipient', id)
    return clone(next)
  }

  async setGiftStatus(ids: string[], status: GiftStatus) {
    const wanted = new Set(ids)
    let matched = 0
    this.giftRecipients = this.giftRecipients.map((r) => {
      if (!wanted.has(r.id)) return r
      matched++
      return r.status === status ? r : { ...r, status, statusAt: nowIso() }
    })
    return matched
  }

  async deleteGiftRecipient(id: string) {
    this.giftRecipients = this.giftRecipients.filter((r) => r.id !== id)
  }

  async importGiftRecipients(rows: NewGiftRecipient[]) {
    const built = rows.map((r) => this.buildRecipient(r))
    // Wie ein INSERT mehrerer Zeilen: scheitert eine, wird keine geschrieben.
    built.forEach((r) => this.checkGiftRecipient(r))
    this.giftRecipients.push(...built)
    return built.length
  }
}

/** Singleton in-memory repo backing the first-draft UI. */
export const mockRepository: Repository = new MockRepository()

/** Fresh, isolated instance for tests (the contract suite needs a clean slate per test). */
export function createMockRepository(): Repository {
  return new MockRepository()
}
