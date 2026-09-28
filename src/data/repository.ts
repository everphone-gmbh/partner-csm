import type { EverphoneAccount } from '@/domain/everphoneAccounts'
import type {
  Activity,
  AppUser,
  AuditEntry,
  AttendanceStatus,
  BuyingRole,
  Contact,
  ContactLink,
  ContactLinkKind,
  CustomerLink,
  EventAttendee,
  EventGuest,
  EventItem,
  EventNote,
  GalleryPhoto,
  GiftOccasion,
  GiftOccasionKind,
  GiftProduct,
  GiftRecipient,
  GiftSender,
  GiftShipping,
  GiftStatus,
  HierarchyLevel,
  IntroRequest,
  LinkedInInfo,
  NoteAttachment,
  OrgUnit,
  Region,
  Reminder,
  Role,
  SentimentEntry,
  SideFact,
  SocialLink,
  TrafficLight,
} from '@/domain/types'

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
  company?: string
  team?: string
  email?: string
  phoneWork?: string
  phoneMobile?: string
  phonePrivate?: string
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
 * The exhaustive set of contact fields the UI may edit. Every key here MUST
 * be persisted by every Repository implementation — the contract tests in
 * repositoryContract.test.ts enforce the round-trip for both backends.
 *
 * Semantics: key present = write it (undefined clears an optional field);
 * key absent = leave unchanged. sideFacts is replaced wholesale; gallery is
 * diffed by id (photos are relation rows, not a column, on Supabase).
 */
/**
 * Was eine Massenzuordnung setzen darf — bewusst eng gehalten. Alles andere
 * (Name, Notizen, sensible Felder) gehört an den einzelnen Kontakt und nicht in
 * eine Aktion, die 400 Datensätze auf einmal überschreibt.
 */
export interface BulkAssignPatch {
  regionId?: string
  /**
   * Was mit den übrigen Gebieten passiert, seit ein Kontakt mehrere haben kann
   * (Migration 0035). `replace` (Vorgabe): der Kontakt gehört danach NUR zu
   * `regionId` — so, wie „Region zuordnen" immer gemeint war. `add`: `regionId`
   * kommt hinzu, vorhandene Gebiete und das führende bleiben.
   */
  regionMode?: 'replace' | 'add'
  relationshipManagerId?: string
}

export interface ContactPatch {
  fullName?: string
  position?: string
  photoUrl?: string | null
  regionId?: string
  /**
   * Alle Gebiete des Kontakts — ersetzt die Menge (Migration 0035), wie
   * `sideFacts` und `customers` auch. Mindestens ein Gebiet ist Pflicht.
   * Gesetzt, gewinnt es gegen `regionId`: das führende Gebiet ergibt sich dann
   * aus dieser Liste.
   */
  regionIds?: string[]
  relationshipManagerId?: string
  company?: string
  /** Ebene im Organigramm; `null` nimmt die Einordnung zurück (0039). */
  hierarchyLevel?: HierarchyLevel | null
  /** Weitere Firmen — ersetzt die Liste (0039). */
  additionalCompanies?: string[]
  team?: string
  email?: string
  phoneWork?: string
  phoneMobile?: string
  phonePrivate?: string
  birthday?: string
  location?: string
  familyStatus?: string
  children?: string
  pets?: string
  phoneDirect?: string
  emailPrivate?: string
  businessAddress?: string
  assistantName?: string
  assistantContact?: string
  socialLinks?: SocialLink[]
  linkedin?: LinkedInInfo
  sentiment?: TrafficLight
  sentimentHistory?: SentimentEntry[]
  cadenceDays?: number
  buyingRole?: BuyingRole
  activeDevices?: string
  wonCustomersCount?: number
  freeText?: string
  sideFacts?: SideFact[]
  gallery?: GalleryPhoto[]
  /** Replace-style like sideFacts; the adapter diffs the customer links. */
  customers?: CustomerLink[]
}

export interface NewContactLink {
  fromContactId: string
  toContactId: string
  kind: ContactLinkKind
  note?: string
}

export interface NewIntroRequest {
  text: string
  createdById: string
  createdByName: string
}

export interface NewEvent {
  name: string
  date: string
  endDate?: string
  location?: string
  description?: string
}

export interface NewReminder {
  contactId: string
  dueDate: string
  dueTime?: string // HH:MM
  text: string
  createdByName: string
}

/** Feldweise Änderung eines Teilnehmers; fehlende Schlüssel bleiben unberührt. */
export interface AttendeePatch {
  status?: AttendanceStatus
  purpose?: string
  /** null löscht den Termin (und damit auch Dauer). */
  slotAt?: string | null
  slotMinutes?: number | null
  meetingPoint?: string | null
}

export interface NewEventNote {
  eventId: string
  text: string
  authorName: string
  /**
   * Profil-ID des Verfassers — Pflichtangabe, kein Freitext.
   *
   * Der Adapter liest die Sitzung bewusst NICHT selbst aus (genau wie
   * `addActivity`): die Oberfläche liefert die ID, und die Insert-Policy
   * `event_notes_insert` (`author_id = auth.uid()`) weist serverseitig ab, was
   * nicht zur Sitzung passt. Ohne dieses Feld ließe sich später nicht
   * entscheiden, wer die Notiz wieder löschen darf.
   */
  authorId: string
  attachments: NoteAttachment[]
  /** Ziel der Notiz: entweder ein bestehender Kontakt … */
  contactId?: string
  /** … oder ein unbekannter Gast (Migration 0028). */
  guestId?: string
}

export interface NewEventGuest {
  eventId: string
  name: string
  company?: string
  note?: string
}

/** Feldweise Änderung eines Gastes; fehlende Schlüssel bleiben unberührt. */
export interface EventGuestPatch {
  name?: string
  company?: string
  note?: string
}

// --- Geschenke (Migration 0036) ---

export interface NewGiftOccasion {
  name: string
  kind: GiftOccasionKind
  shipBy?: string
}

/** Feldweise; `null` leert das Datum, fehlende Schlüssel bleiben. */
export interface GiftOccasionPatch {
  name?: string
  shipBy?: string | null
}

export interface NewGiftProduct {
  occasionId: string
  name: string
  description?: string
  emoji?: string
}

export interface GiftProductPatch {
  name?: string
  description?: string | null
  emoji?: string | null
}

export interface NewGiftRecipient {
  occasionId: string
  productId?: string
  contactId?: string
  firstName?: string
  lastName?: string
  company?: string
  street?: string
  postalCode?: string
  city?: string
  country?: string
  shipping?: GiftShipping
  status?: GiftStatus
  /** Nur beim Import sinnvoll (Vorjahr: zugestellt, aber wann?). Sonst führt die DB ihn. */
  statusAt?: string
  note?: string
  senderIds: string[]
}

/**
 * Feldweise Änderung eines Empfängers. `null` leert ein optionales Feld,
 * fehlende Schlüssel bleiben unberührt, `senderIds` ersetzt die Absender.
 */
export interface GiftRecipientPatch {
  productId?: string | null
  contactId?: string | null
  firstName?: string | null
  lastName?: string | null
  company?: string | null
  street?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
  shipping?: GiftShipping
  status?: GiftStatus
  note?: string | null
  senderIds?: string[]
}

/**
 * Data-access seam. The first draft binds to an in-memory mock; a Supabase
 * implementation will later satisfy the same interface with zero UI changes.
 */
export interface Repository {
  listRegions(): Promise<Region[]>
  /**
   * Legt ein neues Vertriebsgebiet an (immer als echte Region, nie als
   * Platzhalter). Der Name wird getrimmt; ein leerer Name ist ein Fehler.
   * Schreibrecht haben serverseitig nur RM+ (RLS `regions_insert`, 0029).
   *
   * **Finden ODER anlegen:** gibt es bereits ein Gebiet dieses Namens
   * (Groß-/Kleinschreibung egal), wird dieses zurückgegeben statt ein zweites
   * anzulegen. Wer „+ Neue Region" öffnet und einen vorhandenen Namen tippt,
   * meint dieses Gebiet — vorher endete das in einem Eindeutigkeitsfehler der
   * Datenbank, der ungefiltert auf dem Bildschirm landete (2026-09-24).
   */
  createRegion(name: string): Promise<Region>
  /**
   * Benennt ein bestehendes Gebiet um (UPDATE-dann-Neulesen, kein upsert). Der
   * Name wird getrimmt; ein leerer Name ist ein Fehler. Das Platzhalter-Kennzeichen
   * bleibt unberührt — die Oberfläche verhindert das Umbenennen des Platzhalters,
   * die RLS (`regions_update`, 0029) beschränkt den Schreibzugriff auf RM+.
   */
  renameRegion(id: string, name: string): Promise<Region>
  /**
   * Löscht ein LEERES Vertriebsgebiet. Benutzte Gebiete verweigert die
   * Datenbank selbst — contacts.region_id und profiles.region_id sind FKs ohne
   * ON DELETE-Klausel (23503, wird als lesbare Meldung gereicht). Der
   * Platzhalter „Unbekannt" ist über die Delete-Policy geschützt (0030), weil
   * er Ziel von „Zu Kontakt machen" und Default beim Import ist. Zusammenlegen
   * bleibt zweistufig: erst per Massenzuordnung umziehen, dann löschen.
   */
  deleteRegion(id: string): Promise<void>
  /**
   * Setzt die Gebiete eines Kontakts (Migration 0035). Ersetzt die ganze Menge:
   * was nicht in der Liste steht, wird entfernt.
   *
   * Mindestens ein Gebiet ist Pflicht — `contacts.region_id` ist NOT NULL, und
   * ein Kontakt ohne Gebiet wäre für jeden Account Manager unsichtbar. Die
   * Datenbank weist das Entfernen des letzten Gebiets zusätzlich selbst ab.
   *
   * Schreibrecht haben serverseitig nur RM+ (`contact_regions_write`).
   */
  setContactRegions(contactId: string, regionIds: string[]): Promise<Contact>
  /**
   * Zwei Dubletten zusammenführen (Migration 0038, nur Leitung). `patch` sind
   * die Felder, die der Gewinner danach tragen soll (in der Oberfläche je Feld
   * gewählt). Alles, was am Verlierer hängt — Aktivitäten, Reminder,
   * Event-Notizen und -Teilnahmen, Fotos, Anknüpfungspunkte, Kunden, Gebiete,
   * Verknüpfungen, Favoriten, Geschenke — zieht zum Gewinner um; Anknüpfungs-
   * punkte, Kunden und Gebiete werden vereint, nicht ersetzt. Danach ist der
   * Verlierer gelöscht.
   *
   * Scheitert der letzte Schritt, existieren beide Kontakte weiter.
   */
  mergeContacts(winnerId: string, loserId: string, patch?: ContactPatch): Promise<Contact>
  listUsers(): Promise<AppUser[]>
  /** Rolle und/oder Region eines vorhandenen Kontos setzen (Migration 0033).
   *  Serverseitig nur für overall_admin; der Trigger verhindert die Änderung der
   *  eigenen Rolle und das Herabstufen des letzten Administrators.
   *
   *  Bewusst nur BESTEHENDE Konten: ein neues Login anzulegen braucht die
   *  Supabase-Admin-API und damit den Service-Role-Key, der nie im Browser
   *  liegen darf. Das kommt mit Google SSO (Entscheidung 2026-09-17).
   *
   *  Ein leerer Patch schreibt nicht und liefert den unveränderten Stand —
   *  PostgREST lehnt einen leeren PATCH-Rumpf ohnehin ab. */
  updateUser(id: string, patch: { role?: Role; regionId?: string | null }): Promise<AppUser>
  listContacts(): Promise<Contact[]>
  getContact(id: string): Promise<Contact | undefined>
  createContact(input: NewContact): Promise<Contact>
  updateContact(id: string, patch: ContactPatch): Promise<Contact>
  /**
   * Setzt oder entfernt (null) das Kontaktfoto. Eigener Weg statt updateContact,
   * weil das Foto jede Rolle pflegen darf, updateContact aber bei RM+ bleibt
   * (Migration 0032).
   */
  setContactPhoto(contactId: string, photoUrl: string | null): Promise<Contact>
  /** GDPR right to erasure: removes the contact and (via cascade) all
   * dependent personal data — activities, side facts, photos, reminders,
   * event attendance. Admin-gated in the UI and by RLS (0008). */
  deleteContact(id: string): Promise<void>
  /** Handover when a manager leaves: moves all their contacts, returns the count. */
  reassignContacts(fromUserId: string, toUserId: string): Promise<number>

  /**
   * Setzt Region und/oder Betreuer für viele Kontakte in einem Schritt.
   *
   * Bewusst mit expliziten IDs statt einem serverseitigen Filter: die Oberfläche
   * entscheidet über ihre eigenen Filter (Region, Firma, Team, Suche), was
   * ausgewählt ist. Ein falsch gesetzter Filter kann so nicht den halben Bestand
   * umschreiben — geändert wird genau, was der Nutzer angehakt hat.
   *
   * Nicht übergebene Felder bleiben unangetastet; es ist ein Teil-Update.
   *
   * @returns Anzahl der tatsächlich geänderten Kontakte
   */
  bulkAssign(contactIds: string[], patch: BulkAssignPatch): Promise<number>
  /** Links where the contact is either endpoint (the Beziehungsnetz). */
  listContactLinks(contactId: string): Promise<ContactLink[]>
  /** Alle Verknüpfungen — für die Wegsuche über das gesamte Netz. */
  listAllContactLinks(): Promise<ContactLink[]>
  addContactLink(input: NewContactLink): Promise<ContactLink>
  deleteContactLink(id: string): Promise<void>
  listActivities(contactId: string): Promise<Activity[]>
  listAllActivities(): Promise<Activity[]>
  addActivity(input: NewActivity): Promise<Activity>
  /**
   * Korrigiert den Text eines gespeicherten Eintrags (UPDATE-dann-Neulesen,
   * kein upsert). Serverseitig erlaubt für RM+ und den Verfasser (Policy
   * `activities_update`, 0034); der Trigger dort nagelt Kontakt, Verfasser,
   * Zeitpunkt und Art fest und setzt `editedAt` selbst.
   *
   * Anlass: eine per Sprachmemo diktierte Notiz mit Erkennungsfehler war
   * unkorrigierbar (gemeldet 2026-09-24).
   */
  updateActivity(id: string, body: string): Promise<Activity>
  /**
   * Löscht einen Eintrag. Serverseitig erlaubt für RM+ und den Verfasser
   * (Policy `activities_delete`, 0008).
   *
   * Wirft, wenn die Zeile danach noch existiert: eine von der RLS gefilterte
   * Löschung liefert 0 Zeilen und **keinen** Fehler — ohne diese Nachprüfung
   * meldete die Oberfläche Erfolg, obwohl nichts geschehen ist.
   *
   * Einen Eintrag zu löschen, den es nicht (mehr) gibt, ist dagegen kein
   * Fehler — genau wie ein DELETE in Postgres.
   */
  removeActivity(id: string): Promise<void>
  /** Team-wide "Wer kann helfen?" board. */
  listIntroRequests(): Promise<IntroRequest[]>
  addIntroRequest(input: NewIntroRequest): Promise<IntroRequest>
  resolveIntroRequest(id: string, helperName: string): Promise<IntroRequest>
  deleteIntroRequest(id: string): Promise<void>
  listEvents(): Promise<EventItem[]>
  getEvent(id: string): Promise<EventItem | undefined>
  createEvent(input: NewEvent): Promise<EventItem>
  listEventAttendees(eventId: string): Promise<EventAttendee[]>
  setAttendee(
    eventId: string,
    contactId: string,
    patch: AttendeePatch,
  ): Promise<EventAttendee>
  removeAttendee(eventId: string, contactId: string): Promise<void>
  listEventNotes(eventId: string): Promise<EventNote[]>
  addEventNote(input: NewEventNote): Promise<EventNote>
  /**
   * Löscht eine Notiz samt ihrer Anhänge. Serverseitig erlaubt für RM+ und den
   * Verfasser (Policy `event_notes_delete`, Migration 0008:
   * `is_privileged() OR author_id = auth.uid()`).
   *
   * Reihenfolge: erst die Zeile, dann die Dateien. Verweigert die Policy das
   * Löschen, behält die Notiz ihre Bilder, statt mit toten Verweisen
   * dazustehen. Weil ein von der Policy gefiltertes DELETE 0 Zeilen trifft und
   * dabei KEINEN Fehler meldet, wird danach nachgelesen — wie in
   * `deleteRegion`.
   */
  deleteEventNote(id: string): Promise<void>
  /**
   * Entfernt einen einzelnen Anhang aus einer gespeicherten Notiz.
   *
   * Dieselben Rechte wie das Löschen, hier über die Policy
   * `event_notes_update` (0008) und die Storage-Regel `note_media_delete`
   * (`is_privileged() OR owner = auth.uid()`). Geschrieben wird per
   * UPDATE-dann-Neulesen, nie per upsert (Fallstrick 1).
   *
   * Eine unbekannte Anhang-ID ist KEIN Fehler: die Notiz kommt unverändert
   * zurück, und es wird keine Datei angefasst.
   */
  removeEventNoteAttachment(noteId: string, attachmentId: string): Promise<EventNote>
  /** Unbekannte Gäste eines Events (Migration 0028). */
  listEventGuests(eventId: string): Promise<EventGuest[]>
  addEventGuest(input: NewEventGuest): Promise<EventGuest>
  updateEventGuest(id: string, patch: EventGuestPatch): Promise<EventGuest>
  /** Entfernt den Gast und (per Kaskade) die Notizen über ihn. */
  removeEventGuest(id: string): Promise<void>
  /**
   * Macht aus einem Gast einen echten Kontakt: legt den Contact an
   * (fullName = Gastname, company = Gastfirma, position = ''), vermerkt ihn am
   * Gast (promotedContactId) und pflegt dessen Event-Notizen um
   * (guest_id → contact_id). Gibt den neuen Kontakt zurück.
   */
  promoteGuestToContact(
    guestId: string,
    input: { regionId: string; relationshipManagerId: string },
  ): Promise<Contact>
  /** All reminders, or just those for one contact when contactId is given. */
  listReminders(contactId?: string): Promise<Reminder[]>
  addReminder(input: NewReminder): Promise<Reminder>
  toggleReminder(id: string, done: boolean): Promise<Reminder>
  deleteReminder(id: string): Promise<void>
  /**
   * Everphone-Bestandskunden zu den übergebenen Kundennamen (exakter Abgleich
   * auf dem normalisierten Namen). Nur die benötigten Zeilen — die
   * Referenzliste hat Tausende Einträge und gehört nicht in den Client.
   */
  matchEverphoneAccounts(customerNames: string[]): Promise<EverphoneAccount[]>
  /** Namenssuche über die Referenzliste, für die Autovervollständigung. */
  searchEverphoneAccounts(term: string, limit?: number): Promise<EverphoneAccount[]>
  /**
   * Änderungsprotokoll, neueste zuerst. Nur für privilegierte Rollen lesbar
   * (RLS `audit_read`); geschrieben wird ausschließlich per DB-Trigger.
   */
  listAuditLog(limit?: number): Promise<AuditEntry[]>
  /** Soll-Organisationsstruktur der Partner — Maßstab der Abdeckungsanalyse. */
  /** Die ganze Telekom-Struktur samt Notiz — seit 0037 nur für die Leitung lesbar. */
  listOrgUnits(): Promise<OrgUnit[]>
  /**
   * Nur die Namen (Firma, Abteilung, Team) für die Vorschläge beim Tippen —
   * für RM+ über die Funktion org_unit_names() (0037), ohne die Tabelle selbst.
   */
  listOrgUnitNames(): Promise<Pick<OrgUnit, 'company' | 'department' | 'team'>[]>
  /** Pflege der Struktur — serverseitig nur die Leitung (0037). */
  createOrgUnit(input: { company: string; department: string; team?: string; note?: string }): Promise<OrgUnit>
  updateOrgUnit(
    id: string,
    patch: { company?: string; department?: string; team?: string | null; note?: string | null },
  ): Promise<OrgUnit>
  deleteOrgUnit(id: string): Promise<void>

  // Favoriten (Migration 0031) sind persönlich: jede Zeile gehört genau einem
  // Profil. Die Oberfläche reicht die eigene Nutzer-ID herein (wie authorId in
  // addActivity); die Datenbank erzwingt per RLS, dass sie zur Anmeldung passt.
  /** Kontakt-IDs, die dieser Nutzer markiert hat (Migration 0031; RLS: nur eigene Zeilen). */
  listFavorites(profileId: string): Promise<string[]>
  /** Idempotent: doppeltes Markieren ist kein Fehler. */
  addFavorite(profileId: string, contactId: string): Promise<void>
  removeFavorite(profileId: string, contactId: string): Promise<void>

  // --- Geschenke (Migration 0036) — lesen und schreiben ab RM, ohne Regionsfilter ---
  listGiftOccasions(): Promise<GiftOccasion[]>
  createGiftOccasion(input: NewGiftOccasion): Promise<GiftOccasion>
  updateGiftOccasion(id: string, patch: GiftOccasionPatch): Promise<GiftOccasion>
  /** Samt Produkten und Empfängern (Kaskade). Die Oberfläche fragt vorher nach. */
  deleteGiftOccasion(id: string): Promise<void>
  /**
   * Der laufende Geburtstags-Anlass — angelegt beim ersten Bedarf. Die
   * Datenbank lässt genau einen zu; zwei gleichzeitige erste Aufrufe liefern
   * denselben.
   */
  ensureBirthdayOccasion(): Promise<GiftOccasion>

  listGiftProducts(): Promise<GiftProduct[]>
  createGiftProduct(input: NewGiftProduct): Promise<GiftProduct>
  updateGiftProduct(id: string, patch: GiftProductPatch): Promise<GiftProduct>
  /** Empfänger mit diesem Produkt bleiben, nur ohne Produkt. */
  deleteGiftProduct(id: string): Promise<void>

  listGiftSenders(): Promise<GiftSender[]>
  /**
   * Finden ODER anlegen, Groß-/Kleinschreibung egal — sonst entstünden die 45
   * Schreibweisen des Sheets neu. Gibt es den Namen schon, bleibt dessen
   * C-Level-Kennzeichen, wie es ist.
   */
  createGiftSender(name: string, isCLevel?: boolean): Promise<GiftSender>
  updateGiftSender(id: string, patch: { name?: string; isCLevel?: boolean }): Promise<GiftSender>
  deleteGiftSender(id: string): Promise<void>

  /** Alle Empfänger aller Anlässe — ein paar hundert Zeilen, gezählt wird im Browser. */
  listGiftRecipients(): Promise<GiftRecipient[]>
  /** Geschenkhistorie eines Kontakts für seine Karte. */
  listContactGifts(contactId: string): Promise<GiftRecipient[]>
  createGiftRecipient(input: NewGiftRecipient): Promise<GiftRecipient>
  updateGiftRecipient(id: string, patch: GiftRecipientPatch): Promise<GiftRecipient>
  /** Status für mehrere auf einmal; liefert die Zahl der getroffenen Zeilen. */
  setGiftStatus(ids: string[], status: GiftStatus): Promise<number>
  deleteGiftRecipient(id: string): Promise<void>
  /**
   * Viele Empfänger auf einmal (Import einer Liste). Legt in Blöcken an, damit
   * weder Anfrage noch Adresszeile zu lang werden. Liefert die Zahl der
   * angelegten Zeilen.
   */
  importGiftRecipients(rows: NewGiftRecipient[]): Promise<number>
}
