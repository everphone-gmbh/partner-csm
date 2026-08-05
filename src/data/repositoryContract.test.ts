// Repository contract suite: the SAME scenarios run against the in-memory
// mock and the Supabase adapter (over a fake client), so the two
// implementations cannot drift apart — every field the UI can edit must
// survive an update → read round-trip in both.
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NewContact, Repository } from './repository'
import { createMockRepository } from './mockRepository'
import { SupabaseRepository } from './supabaseRepository'
import { createFakeSupabase } from '@/test/fakeSupabase'
import { seedEverphoneAccounts, seedOrgUnits } from './seed'
import { normalizeCompanyName, type EverphoneStatus } from '@/domain/everphoneAccounts'

const VERIFIER = { id: 'profiles-verifier', full_name: 'Alexandra Verifier' }

/** Rückabbildung Status → Salesforce `Account.Type` für die Testdaten. */
const SF_TYPE_BY_STATUS: Record<EverphoneStatus, string> = {
  customer: 'Customer',
  inactive: 'Inactive Customer',
  offboarding: 'Offboarding',
  prospect: 'Prospect',
  other: 'Partner',
}

const BASE: NewContact = {
  fullName: 'Test Person',
  position: 'CIO',
  regionId: 'r-1',
  relationshipManagerId: VERIFIER.id,
}

// Der Mock liest die Everphone-Referenz aus seedEverphoneAccounts; damit
// beide Implementierungen im Contract dieselben Daten sehen, wird der
// Fake-Supabase-Client aus genau derselben Quelle befüllt.
const EVERPHONE_ROWS = seedEverphoneAccounts.map((a, i) => ({
  id: `ea-${i}`,
  salesforce_id: a.salesforceId,
  name: a.name,
  name_normalized: normalizeCompanyName(a.name),
  account_type: SF_TYPE_BY_STATUS[a.status],
  active_rentals: a.activeRentals ?? null,
}))

const IMPLEMENTATIONS: [string, () => Repository][] = [
  ['mockRepository', () => createMockRepository()],
  [
    'SupabaseRepository',
    () =>
      new SupabaseRepository(
        createFakeSupabase({
          profiles: [VERIFIER],
          everphone_accounts: EVERPHONE_ROWS,
          // Gleiche Quelle wie der Mock, damit der Contract identische Daten prüft.
          org_units: seedOrgUnits.map((u) => ({ ...u, note: null })),
        }) as unknown as SupabaseClient,
      ),
  ],
]

for (const [name, makeRepo] of IMPLEMENTATIONS) {
  describe(`Repository contract (${name})`, () => {
    let repo: Repository

    beforeEach(() => {
      repo = makeRepo()
    })

    it('persists every editable Stammdaten field through updateContact', async () => {
      const c = await repo.createContact(BASE)
      await repo.updateContact(c.id, {
        fullName: 'Neu Name',
        position: 'CTO',
        team: 'Team A',
        email: 'x@example.com',
        birthday: '1980-05-05',
        location: 'Bonn',
        familyStatus: 'ledig',
        children: '1',
        pets: 'Hund',
        activeDevices: '1x iPad',
        wonCustomersCount: 7,
        sentiment: 'green',
      })
      const read = await repo.getContact(c.id)
      expect(read).toMatchObject({
        fullName: 'Neu Name',
        position: 'CTO',
        team: 'Team A',
        email: 'x@example.com',
        birthday: '1980-05-05',
        location: 'Bonn',
        familyStatus: 'ledig',
        children: '1',
        pets: 'Hund',
        activeDevices: '1x iPad',
        wonCustomersCount: 7,
        sentiment: 'green',
      })
    })

    it('persists freeText and photoUrl', async () => {
      const c = await repo.createContact(BASE)
      await repo.updateContact(c.id, { freeText: 'Wichtige Notiz', photoUrl: 'data:image/jpeg;x' })
      const read = await repo.getContact(c.id)
      expect(read?.freeText).toBe('Wichtige Notiz')
      expect(read?.photoUrl).toBe('data:image/jpeg;x')
    })

    it('clears an optional field when the patch key is present but undefined', async () => {
      const c = await repo.createContact({ ...BASE, team: 'Altes Team', email: 'alt@example.com' })
      await repo.updateContact(c.id, { team: undefined, email: undefined })
      const read = await repo.getContact(c.id)
      expect(read?.team).toBeUndefined()
      expect(read?.email).toBeUndefined()
    })

    it('replaces side facts through updateContact', async () => {
      const c = await repo.createContact({
        ...BASE,
        sideFacts: [{ id: 'sf-a', label: 'Segeln', category: 'sport' }],
      })
      await repo.updateContact(c.id, {
        sideFacts: [
          { id: 'sf-b', label: 'Kochen', category: 'hobby' },
          { id: 'sf-c', label: 'Zwei Kinder', category: 'family' },
        ],
      })
      const read = await repo.getContact(c.id)
      expect(read?.sideFacts.map((f) => [f.label, f.category]).sort()).toEqual([
        ['Kochen', 'hobby'],
        ['Zwei Kinder', 'family'],
      ])
    })

    it('persists gallery additions and removals', async () => {
      const c = await repo.createContact(BASE)
      await repo.updateContact(c.id, {
        gallery: [
          { id: 'tmp-1', url: 'data:img-1', caption: 'Messe' },
          { id: 'tmp-2', url: 'data:img-2' },
        ],
      })
      const afterAdd = await repo.getContact(c.id)
      expect(afterAdd?.gallery?.map((p) => p.url).sort()).toEqual(['data:img-1', 'data:img-2'])
      expect(afterAdd?.gallery?.find((p) => p.url === 'data:img-1')?.caption).toBe('Messe')

      const keep = afterAdd!.gallery!.filter((p) => p.url === 'data:img-2')
      await repo.updateContact(c.id, { gallery: keep })
      const afterRemove = await repo.getContact(c.id)
      expect(afterRemove?.gallery?.map((p) => p.url)).toEqual(['data:img-2'])
    })

    it('persists LinkedIn info including verifier attribution', async () => {
      const c = await repo.createContact(BASE)
      await repo.updateContact(c.id, {
        linkedin: {
          status: 'no_account',
          verifiedById: VERIFIER.id,
          verifiedByName: VERIFIER.full_name,
          verifiedAt: '2026-07-01',
        },
      })
      const read = await repo.getContact(c.id)
      expect(read?.linkedin.status).toBe('no_account')
      expect(read?.linkedin.verifiedAt).toBe('2026-07-01')
      expect(read?.linkedin.verifiedByName).toBe(VERIFIER.full_name)
    })

    it('persists the sentiment history', async () => {
      const c = await repo.createContact(BASE)
      const history = [{ at: '2026-07-01T10:00:00.000Z', value: 'amber' as const, byName: 'A' }]
      await repo.updateContact(c.id, { sentiment: 'amber', sentimentHistory: history })
      const read = await repo.getContact(c.id)
      expect(read?.sentiment).toBe('amber')
      expect(read?.sentimentHistory).toEqual(history)
    })

    it('handles a relations-only patch without a column update', async () => {
      const c = await repo.createContact(BASE)
      await repo.updateContact(c.id, {
        gallery: [{ id: 'tmp-1', url: 'data:img-1' }],
      })
      const read = await repo.getContact(c.id)
      expect(read?.gallery?.map((p) => p.url)).toEqual(['data:img-1'])
      expect(read?.fullName).toBe(BASE.fullName)
    })

    it('deleteContact erases the contact (right to erasure)', async () => {
      const c = await repo.createContact({
        ...BASE,
        sideFacts: [{ id: 'sf-a', label: 'Golf', category: 'sport' }],
      })
      await repo.addActivity({
        contactId: c.id,
        type: 'note',
        occurredAt: '2026-07-01T10:00:00.000Z',
        authorId: VERIFIER.id,
        authorName: VERIFIER.full_name,
        body: 'Vertrauliche Notiz',
      })
      await repo.deleteContact(c.id)
      expect(await repo.getContact(c.id)).toBeUndefined()
      // Cascade: the contact's activities must not survive as orphans.
      expect(await repo.listActivities(c.id)).toEqual([])
    })

    it('persists, lists (from both endpoints) and deletes contact links', async () => {
      const a = await repo.createContact(BASE)
      const b = await repo.createContact({ ...BASE, fullName: 'Zweite Person' })
      const created = await repo.addContactLink({
        fromContactId: a.id,
        toContactId: b.id,
        kind: 'reports_to',
        note: 'seit 2024',
      })
      expect(created.kind).toBe('reports_to')

      const fromA = await repo.listContactLinks(a.id)
      const fromB = await repo.listContactLinks(b.id)
      expect(fromA.map((l) => l.toContactId)).toEqual([b.id])
      expect(fromB.map((l) => l.fromContactId)).toEqual([a.id])
      expect(fromA[0].note).toBe('seit 2024')

      await repo.deleteContactLink(created.id)
      expect(await repo.listContactLinks(a.id)).toEqual([])
    })

    it('erasing a contact removes its links (cascade)', async () => {
      const a = await repo.createContact(BASE)
      const b = await repo.createContact({ ...BASE, fullName: 'Zweite Person' })
      await repo.addContactLink({ fromContactId: a.id, toContactId: b.id, kind: 'knows' })
      await repo.deleteContact(b.id)
      expect(await repo.listContactLinks(a.id)).toEqual([])
    })

    it('round-trips the cadence target through updateContact', async () => {
      const c = await repo.createContact(BASE)
      await repo.updateContact(c.id, { cadenceDays: 30 })
      expect((await repo.getContact(c.id))?.cadenceDays).toBe(30)
      await repo.updateContact(c.id, { cadenceDays: undefined })
      expect((await repo.getContact(c.id))?.cadenceDays).toBeUndefined()
    })

    it('round-trips all three phone numbers through updateContact', async () => {
      const c = await repo.createContact(BASE)

      await repo.updateContact(c.id, {
        phoneWork: '+49 40 123456-0',
        phoneMobile: '+49 170 1234567',
        phonePrivate: '+49 40 999999',
      })

      const after = await repo.getContact(c.id)
      expect(after?.phoneWork).toBe('+49 40 123456-0')
      expect(after?.phoneMobile).toBe('+49 170 1234567')
      expect(after?.phonePrivate).toBe('+49 40 999999')
    })

    it('round-trips the company through updateContact', async () => {
      const c = await repo.createContact({ ...BASE, company: 'Lenovo' })
      expect((await repo.getContact(c.id))?.company).toBe('Lenovo')
      await repo.updateContact(c.id, { company: 'Samsung' })
      expect((await repo.getContact(c.id))?.company).toBe('Samsung')
      await repo.updateContact(c.id, { company: undefined })
      expect((await repo.getContact(c.id))?.company).toBeUndefined()
    })

    it('adds and removes customers through updateContact', async () => {
      const c = await repo.createContact(BASE)
      await repo.updateContact(c.id, {
        customers: [
          { id: 'tmp-1', name: 'Nordmetall AG', withUs: true, salesforceUrl: 'https://example.salesforce.com/acc/1' },
          { id: 'tmp-2', name: 'Hanse Logistik', withUs: false },
        ],
      })
      const afterAdd = await repo.getContact(c.id)
      expect(afterAdd?.customers.map((x) => [x.name, x.withUs]).sort()).toEqual([
        ['Hanse Logistik', false],
        ['Nordmetall AG', true],
      ])
      expect(afterAdd?.customers.find((x) => x.name === 'Nordmetall AG')?.salesforceUrl).toBe(
        'https://example.salesforce.com/acc/1',
      )

      const keep = afterAdd!.customers.filter((x) => x.name === 'Hanse Logistik')
      await repo.updateContact(c.id, { customers: keep })
      const afterRemove = await repo.getContact(c.id)
      expect(afterRemove?.customers.map((x) => x.name)).toEqual(['Hanse Logistik'])
    })

    it('reassigns all contacts of one manager to another', async () => {
      const a = await repo.createContact({ ...BASE, relationshipManagerId: 'rm-old' })
      const b = await repo.createContact({ ...BASE, fullName: 'Zweite Person', relationshipManagerId: 'rm-old' })
      const other = await repo.createContact({ ...BASE, fullName: 'Dritte Person', relationshipManagerId: 'rm-other' })

      const moved = await repo.reassignContacts('rm-old', 'rm-new')
      expect(moved).toBe(2)
      expect((await repo.getContact(a.id))?.relationshipManagerId).toBe('rm-new')
      expect((await repo.getContact(b.id))?.relationshipManagerId).toBe('rm-new')
      expect((await repo.getContact(other.id))?.relationshipManagerId).toBe('rm-other')
    })

    it('round-trips the buying-center role through updateContact', async () => {
      const c = await repo.createContact(BASE)
      await repo.updateContact(c.id, { buyingRole: 'champion' })
      expect((await repo.getContact(c.id))?.buyingRole).toBe('champion')
      await repo.updateContact(c.id, { buyingRole: undefined })
      expect((await repo.getContact(c.id))?.buyingRole).toBeUndefined()
    })

    it('round-trips the contact assignment on event notes and cascades on erasure', async () => {
      const c = await repo.createContact(BASE)
      const ev = await repo.createEvent({ name: 'Digital X', date: '2026-10-15' })
      await repo.addEventNote({
        eventId: ev.id,
        text: 'Gutes Gespräch am Stand',
        authorName: VERIFIER.full_name,
        attachments: [],
        contactId: c.id,
      })
      const notes = await repo.listEventNotes(ev.id)
      expect(notes).toHaveLength(1)
      expect(notes[0].contactId).toBe(c.id)

      // GDPR: erasing the contact removes notes about them.
      await repo.deleteContact(c.id)
      expect(await repo.listEventNotes(ev.id)).toEqual([])
    })

    it('keeps unassigned event notes when a contact is erased', async () => {
      const c = await repo.createContact(BASE)
      const ev = await repo.createEvent({ name: 'CIO Move', date: '2026-11-01' })
      await repo.addEventNote({
        eventId: ev.id,
        text: 'Allgemeine Standnotiz',
        authorName: VERIFIER.full_name,
        attachments: [],
      })
      await repo.deleteContact(c.id)
      expect((await repo.listEventNotes(ev.id)).map((n) => n.text)).toEqual(['Allgemeine Standnotiz'])
    })

    it('creates, resolves and deletes intro requests (Hilfe-Board)', async () => {
      const req = await repo.addIntroRequest({
        text: 'Brauche einen Draht zum Einkauf Region Süd',
        createdById: VERIFIER.id,
        createdByName: VERIFIER.full_name,
      })
      expect(req.status).toBe('open')

      const open = await repo.listIntroRequests()
      expect(open.map((r) => r.id)).toContain(req.id)

      const resolved = await repo.resolveIntroRequest(req.id, 'Olaf Gründel')
      expect(resolved.status).toBe('resolved')
      expect(resolved.helperName).toBe('Olaf Gründel')

      await repo.deleteIntroRequest(req.id)
      expect((await repo.listIntroRequests()).map((r) => r.id)).not.toContain(req.id)
    })

    it('createContact persists LinkedIn and side facts', async () => {
      const created = await repo.createContact({
        ...BASE,
        linkedin: {
          status: 'has_account',
          url: 'https://www.linkedin.com/in/test',
          verifiedById: VERIFIER.id,
          verifiedByName: VERIFIER.full_name,
          verifiedAt: '2026-06-15',
        },
        sideFacts: [{ id: 'sf-a', label: 'Golf', category: 'sport' }],
      })
      const read = await repo.getContact(created.id)
      expect(read?.linkedin.status).toBe('has_account')
      expect(read?.linkedin.url).toBe('https://www.linkedin.com/in/test')
      expect(read?.linkedin.verifiedByName).toBe(VERIFIER.full_name)
      expect(read?.sideFacts.map((f) => f.label)).toEqual(['Golf'])
    })

    describe('Soll-Organisationsstruktur', () => {
      it('liefert Einheiten mit Firma, Abteilung und Team', async () => {
        const units = await repo.listOrgUnits()
        expect(units.length).toBeGreaterThan(0)
        for (const u of units) {
          expect(u.company).toBeTruthy()
          expect(u.department).toBeTruthy()
          // team darf null sein (Abteilungsebene), aber nicht undefined-artig.
          expect(u.team === null || typeof u.team === 'string').toBe(true)
        }
      })

      it('enthält sowohl Abteilungsebene als auch Unterteams', async () => {
        const units = await repo.listOrgUnits()
        expect(units.some((u) => u.team === null)).toBe(true)
        expect(units.some((u) => u.team !== null)).toBe(true)
      })
    })

    describe('Änderungsprotokoll', () => {
      it('protokolliert Anlegen, Ändern und Löschen eines Kontakts', async () => {
        const c = await repo.createContact(BASE)
        await repo.updateContact(c.id, { birthday: '1980-01-01' })
        await repo.deleteContact(c.id)

        const log = await repo.listAuditLog()
        const mine = log.filter((e) => e.entityId === c.id)
        expect(mine.map((e) => e.action)).toEqual(['delete', 'update', 'insert'])
        expect(mine.every((e) => e.entity === 'contact')).toBe(true)
      })

      it('nennt bei Änderungen die betroffenen Felder, aber keine Werte', async () => {
        const c = await repo.createContact(BASE)
        await repo.updateContact(c.id, { birthday: '1980-01-01', pets: 'Hund' })
        const entry = (await repo.listAuditLog()).find(
          (e) => e.entityId === c.id && e.action === 'update',
        )
        expect(entry?.fields).toBeDefined()
        expect(entry!.fields!.length).toBeGreaterThan(0)
        // Der Eintrag darf die Werte selbst nirgends enthalten.
        expect(JSON.stringify(entry)).not.toContain('1980-01-01')
        expect(JSON.stringify(entry)).not.toContain('Hund')
      })

      it('liefert neueste Einträge zuerst und achtet auf das Limit', async () => {
        const c = await repo.createContact(BASE)
        await repo.updateContact(c.id, { position: 'A' })
        await repo.updateContact(c.id, { position: 'B' })
        const log = await repo.listAuditLog()
        expect(log.length).toBeGreaterThanOrEqual(3)
        for (let i = 1; i < log.length; i++) {
          expect(Date.parse(log[i - 1].at)).toBeGreaterThanOrEqual(Date.parse(log[i].at))
        }
        expect(await repo.listAuditLog(1)).toHaveLength(1)
      })

      it('ordnet auch Einträge mit identischem Zeitstempel korrekt', async () => {
        // Postgres stempelt alle Änderungen einer Transaktion mit derselben
        // Zeit; ohne die laufende Nummer als zweiten Schlüssel wäre die
        // Reihenfolge zufällig.
        const c = await repo.createContact(BASE)
        await repo.updateContact(c.id, { position: 'Erst' })
        await repo.updateContact(c.id, { position: 'Dann' })
        const mine = (await repo.listAuditLog()).filter((e) => e.entityId === c.id)
        expect(mine.map((e) => e.action)).toEqual(['update', 'update', 'insert'])
        // Neueste zuerst ⇒ absteigende laufende Nummer.
        expect(mine[0].id).toBeGreaterThan(mine[1].id)
        expect(mine[1].id).toBeGreaterThan(mine[2].id)
      })

      it('protokolliert nichts, wenn ein Update nichts verändert', async () => {
        const c = await repo.createContact({ ...BASE, position: 'CIO' })
        const before = (await repo.listAuditLog()).length
        await repo.updateContact(c.id, { position: 'CIO' })
        expect((await repo.listAuditLog()).length).toBe(before)
      })
    })

    describe('Event-Scheduling', () => {
      it('legt mehrtägige Events an und liest das Enddatum zurück', async () => {
        const ev = await repo.createEvent({
          name: 'Digital X',
          date: '2026-10-14',
          endDate: '2026-10-16',
          location: 'Köln',
        })
        expect(ev.endDate).toBe('2026-10-16')
        expect((await repo.getEvent(ev.id))?.endDate).toBe('2026-10-16')
      })

      it('lässt das Enddatum bei eintägigen Events leer', async () => {
        const ev = await repo.createEvent({ name: 'Webinar', date: '2026-10-14' })
        expect(ev.endDate).toBeUndefined()
        expect((await repo.getEvent(ev.id))?.endDate).toBeUndefined()
      })

      it('speichert Termin, Dauer und Treffpunkt eines Teilnehmers', async () => {
        const c = await repo.createContact(BASE)
        const ev = await repo.createEvent({ name: 'Digital X', date: '2026-10-14' })
        const slot = '2026-10-14T12:30:00.000Z'
        await repo.setAttendee(ev.id, c.id, {
          status: 'accepted',
          slotAt: slot,
          slotMinutes: 45,
          meetingPoint: 'Halle 4, Stand B3',
        })
        const [read] = await repo.listEventAttendees(ev.id)
        expect(read.status).toBe('accepted')
        expect(Date.parse(read.slotAt!)).toBe(Date.parse(slot))
        expect(read.slotMinutes).toBe(45)
        expect(read.meetingPoint).toBe('Halle 4, Stand B3')
      })

      it('lässt den Termin unberührt, wenn nur der Status geändert wird', async () => {
        const c = await repo.createContact(BASE)
        const ev = await repo.createEvent({ name: 'Digital X', date: '2026-10-14' })
        await repo.setAttendee(ev.id, c.id, { slotAt: '2026-10-14T09:00:00.000Z', slotMinutes: 30 })
        await repo.setAttendee(ev.id, c.id, { status: 'attended' })
        const [read] = await repo.listEventAttendees(ev.id)
        expect(read.status).toBe('attended')
        expect(read.slotAt).toBeDefined()
        expect(read.slotMinutes).toBe(30)
      })

      it('löscht mit dem Termin auch die Dauer', async () => {
        const c = await repo.createContact(BASE)
        const ev = await repo.createEvent({ name: 'Digital X', date: '2026-10-14' })
        await repo.setAttendee(ev.id, c.id, { slotAt: '2026-10-14T09:00:00.000Z', slotMinutes: 60 })
        await repo.setAttendee(ev.id, c.id, { slotAt: null })
        const [read] = await repo.listEventAttendees(ev.id)
        expect(read.slotAt).toBeUndefined()
        expect(read.slotMinutes).toBeUndefined()
      })

      it('behält alle anderen Felder bei einem Teil-Patch (kein Zeilen-Überschreiben)', async () => {
        // Regression: mit PostgREST-upsert löschte ein Status-Wechsel Termin,
        // Dauer, Treffpunkt und „Wofür" — nicht im Payload = auf NULL gesetzt.
        const c = await repo.createContact(BASE)
        const ev = await repo.createEvent({ name: 'Digital X', date: '2026-10-14' })
        await repo.setAttendee(ev.id, c.id, {
          status: 'accepted',
          purpose: 'Rahmenvertrag besprechen',
          slotAt: '2026-10-14T08:00:00.000Z',
          slotMinutes: 60,
          meetingPoint: 'Halle 4',
        })

        // Jeder Teil-Patch darf nur sein eigenes Feld verändern.
        await repo.setAttendee(ev.id, c.id, { status: 'attended' })
        let [read] = await repo.listEventAttendees(ev.id)
        expect(read.purpose).toBe('Rahmenvertrag besprechen')
        expect(read.slotMinutes).toBe(60)
        expect(read.meetingPoint).toBe('Halle 4')
        expect(read.slotAt).toBeDefined()

        await repo.setAttendee(ev.id, c.id, { purpose: 'Neues Ziel' })
        ;[read] = await repo.listEventAttendees(ev.id)
        expect(read.status).toBe('attended')
        expect(read.slotMinutes).toBe(60)
        expect(read.meetingPoint).toBe('Halle 4')

        await repo.setAttendee(ev.id, c.id, { slotMinutes: 90 })
        ;[read] = await repo.listEventAttendees(ev.id)
        expect(read.slotMinutes).toBe(90)
        expect(read.status).toBe('attended')
        expect(read.purpose).toBe('Neues Ziel')
        expect(read.meetingPoint).toBe('Halle 4')
      })

      it('legt beim ersten Patch genau eine Zeile an', async () => {
        const c = await repo.createContact(BASE)
        const ev = await repo.createEvent({ name: 'Digital X', date: '2026-10-14' })
        await repo.setAttendee(ev.id, c.id, { status: 'invited' })
        await repo.setAttendee(ev.id, c.id, { purpose: 'Ziel' })
        expect(await repo.listEventAttendees(ev.id)).toHaveLength(1)
      })

      it('lässt Teilnehmer ohne Termin zu', async () => {
        const c = await repo.createContact(BASE)
        const ev = await repo.createEvent({ name: 'Digital X', date: '2026-10-14' })
        await repo.setAttendee(ev.id, c.id, { status: 'invited' })
        const [read] = await repo.listEventAttendees(ev.id)
        expect(read.slotAt).toBeUndefined()
        expect(read.slotMinutes).toBeUndefined()
        expect(read.meetingPoint).toBeUndefined()
      })
    })

    describe('Everphone-Bestandskunden-Abgleich', () => {
      it('trifft über Rechtsform-Unterschiede hinweg und liefert den Status', async () => {
        const hits = await repo.matchEverphoneAccounts(['Nordmetall AG'])
        expect(hits).toHaveLength(1)
        expect(hits[0].status).toBe('customer')
        expect(hits[0].activeRentals).toBe(412)

        const viaShortName = await repo.matchEverphoneAccounts(['nordmetall'])
        expect(viaShortName[0]?.salesforceId).toBe(hits[0].salesforceId)
      })

      it('gibt für unbekannte und leere Namen nichts zurück', async () => {
        expect(await repo.matchEverphoneAccounts(['Völlig Unbekannt GmbH'])).toEqual([])
        expect(await repo.matchEverphoneAccounts([])).toEqual([])
        expect(await repo.matchEverphoneAccounts([''])).toEqual([])
      })

      it('gleicht mehrere Namen in einem Aufruf ab', async () => {
        const hits = await repo.matchEverphoneAccounts([
          'Nordmetall AG',
          'Main Finanz AG',
          'Gibt Es Nicht GmbH',
        ])
        expect(hits.map((h) => h.status).sort()).toEqual(['customer', 'offboarding'])
      })

      it('findet Kandidaten per Teilstring für die Autovervollständigung', async () => {
        const hits = await repo.searchEverphoneAccounts('nordm')
        expect(hits.map((h) => h.name)).toEqual(['Nordmetall AG'])
      })

      it('sucht erst ab zwei Zeichen', async () => {
        expect(await repo.searchEverphoneAccounts('n')).toEqual([])
        expect(await repo.searchEverphoneAccounts('  ')).toEqual([])
      })

      it('kappt die Trefferliste am Limit', async () => {
        // „an“ steckt in „Main Finanz AG“ und „Hanse Logistik GmbH“.
        expect(await repo.searchEverphoneAccounts('an')).toHaveLength(2)
        expect(await repo.searchEverphoneAccounts('an', 1)).toHaveLength(1)
      })

      it('behandelt Eingaben nicht als Wildcards', async () => {
        expect(await repo.searchEverphoneAccounts('%')).toEqual([])
        expect(await repo.searchEverphoneAccounts('No%all')).toEqual([])
      })
    })

    describe('Massenzuordnung', () => {
      it('setzt den Betreuer nur für die ausgewählten Kontakte', async () => {
        const a = await repo.createContact({ ...BASE, fullName: 'A' })
        const b = await repo.createContact({ ...BASE, fullName: 'B' })
        const c = await repo.createContact({ ...BASE, fullName: 'C' })

        const changed = await repo.bulkAssign([a.id, b.id], { relationshipManagerId: 'u-neu' })

        expect(changed).toBe(2)
        expect((await repo.getContact(a.id))?.relationshipManagerId).toBe('u-neu')
        expect((await repo.getContact(b.id))?.relationshipManagerId).toBe('u-neu')
        expect((await repo.getContact(c.id))?.relationshipManagerId).toBe(VERIFIER.id)
      })

      it('setzt Region und Betreuer in einem Schritt', async () => {
        const a = await repo.createContact({ ...BASE, fullName: 'A' })

        await repo.bulkAssign([a.id], { regionId: 'r-2', relationshipManagerId: 'u-neu' })

        const after = await repo.getContact(a.id)
        expect(after?.regionId).toBe('r-2')
        expect(after?.relationshipManagerId).toBe('u-neu')
      })

      it('lässt alle übrigen Felder unangetastet', async () => {
        // Der eigentliche Grund für diesen Test: mit upsert statt update würde
        // die ganze Zeile geschrieben und alles Nichtübergebene auf NULL fallen.
        const a = await repo.createContact({
          ...BASE,
          fullName: 'Vollständig',
          position: 'CIO',
          email: 'cio@example.com',
          team: 'Team A',
          freeText: 'Wichtige Notiz',
        })

        await repo.bulkAssign([a.id], { relationshipManagerId: 'u-neu' })

        const after = await repo.getContact(a.id)
        expect(after?.fullName).toBe('Vollständig')
        expect(after?.position).toBe('CIO')
        expect(after?.email).toBe('cio@example.com')
        expect(after?.team).toBe('Team A')
        expect(after?.freeText).toBe('Wichtige Notiz')
      })

      it('zählt nur getroffene Kontakte und ignoriert unbekannte IDs', async () => {
        const a = await repo.createContact({ ...BASE, fullName: 'A' })

        expect(await repo.bulkAssign([a.id, 'gibt-es-nicht'], { regionId: 'r-2' })).toBe(1)
      })

      it('tut ohne Auswahl oder ohne Feld nichts', async () => {
        const a = await repo.createContact({ ...BASE, fullName: 'A' })

        expect(await repo.bulkAssign([], { regionId: 'r-2' })).toBe(0)
        expect(await repo.bulkAssign([a.id], {})).toBe(0)
        expect((await repo.getContact(a.id))?.regionId).toBe('r-1')
      })
    })
  })
}
