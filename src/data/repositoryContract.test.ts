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

const VERIFIER = { id: 'profiles-verifier', full_name: 'Alexandra Verifier' }

const BASE: NewContact = {
  fullName: 'Test Person',
  position: 'CIO',
  regionId: 'r-1',
  relationshipManagerId: VERIFIER.id,
}

const IMPLEMENTATIONS: [string, () => Repository][] = [
  ['mockRepository', () => createMockRepository()],
  [
    'SupabaseRepository',
    () =>
      new SupabaseRepository(
        createFakeSupabase({ profiles: [VERIFIER] }) as unknown as SupabaseClient,
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

    it('round-trips the buying-center role through updateContact', async () => {
      const c = await repo.createContact(BASE)
      await repo.updateContact(c.id, { buyingRole: 'champion' })
      expect((await repo.getContact(c.id))?.buyingRole).toBe('champion')
      await repo.updateContact(c.id, { buyingRole: undefined })
      expect((await repo.getContact(c.id))?.buyingRole).toBeUndefined()
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
  })
}
