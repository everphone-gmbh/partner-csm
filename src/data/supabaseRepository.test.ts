import { describe, it, expect } from 'vitest'
import {
  mapRowToActivity,
  mapRowToContact,
  patchToRow,
  type ActivityRow,
  type ContactRow,
} from './supabaseRepository'

const contactRow: ContactRow = {
  id: 'c-1',
  full_name: 'Anke Richter',
  position: 'Leiterin Partner Management',
  photo_url: null,
  region_id: 'r-nord',
  relationship_manager_id: 'u-alex',
  company: 'Telekom Deutschland GmbH',
  email: 'anke@example.com',
  phone_work: '+49 40 123456-0',
  phone_mobile: '+49 170 1234567',
  phone_private: '+49 40 999999',
  phone_direct: '+49 40 123456-1',
  email_private: 'anke.privat@example.com',
  business_address: 'Überseering 2, 22297 Hamburg',
  assistant_name: 'Petra Assistenz',
  assistant_contact: 'assistenz@example.com',
  social_links: [{ label: 'LinkedIn', url: 'https://linkedin.com/in/anke' }],
  birthday: '1979-07-03',
  location: 'Hamburg',
  family_status: 'verheiratet',
  children: '2',
  pets: null,
  team: null,
  linkedin_status: 'no_account',
  linkedin_url: null,
  linkedin_verified_by: 'u-alex',
  linkedin_verified_at: '2026-05-20',
  sentiment: 'green',
  sentiment_history: null,
  cadence_days: 30,
  buying_role: 'champion',
  active_devices: '2x iPhone',
  won_customers_count: 4,
  free_text: 'Notiz',
  created_at: '2026-04-01T09:00:00.000Z',
  updated_at: '2026-06-25T14:30:00.000Z',
  side_facts: [{ id: 'sf1', label: 'Segeln', category: 'sport' }],
  contact_customers: [
    { with_us: true, customers: { id: 'cu1', name: 'ACME', salesforce_url: null } },
    { with_us: false, customers: { id: 'cu2', name: 'Beta', salesforce_url: 'https://sf/acc' } },
  ],
}

describe('mapRowToContact', () => {
  it('maps snake_case columns and nested relations to the domain Contact', () => {
    const c = mapRowToContact(contactRow, (id) => (id === 'u-alex' ? 'Alexandra' : undefined))
    expect(c.fullName).toBe('Anke Richter')
    expect(c.phoneWork).toBe('+49 40 123456-0')
    expect(c.phoneMobile).toBe('+49 170 1234567')
    expect(c.phonePrivate).toBe('+49 40 999999')
    expect(c.phoneDirect).toBe('+49 40 123456-1')
    expect(c.emailPrivate).toBe('anke.privat@example.com')
    expect(c.businessAddress).toBe('Überseering 2, 22297 Hamburg')
    expect(c.assistantName).toBe('Petra Assistenz')
    expect(c.assistantContact).toBe('assistenz@example.com')
    expect(c.socialLinks).toEqual([{ label: 'LinkedIn', url: 'https://linkedin.com/in/anke' }])
    expect(c.regionId).toBe('r-nord')
    expect(c.linkedin.status).toBe('no_account')
    expect(c.linkedin.verifiedByName).toBe('Alexandra')
    expect(c.linkedin.verifiedAt).toBe('2026-05-20')
    expect(c.sideFacts).toHaveLength(1)
    expect(c.sideFacts[0].category).toBe('sport')
    expect(c.customers.map((x) => x.withUs)).toEqual([true, false])
    expect(c.customers[1].salesforceUrl).toBe('https://sf/acc')
  })

  it('defaults missing optionals safely', () => {
    const minimal: ContactRow = {
      ...contactRow,
      position: null,
      won_customers_count: 0,
      side_facts: null,
      contact_customers: null,
    }
    const c = mapRowToContact(minimal)
    expect(c.position).toBe('')
    expect(c.wonCustomersCount).toBe(0)
    expect(c.sideFacts).toEqual([])
    expect(c.customers).toEqual([])
    expect(c.linkedin.verifiedByName).toBeUndefined()
  })
})

describe('mapRowToActivity', () => {
  const row: ActivityRow = {
    id: 'a-1',
    contact_id: 'c-1',
    type: 'call',
    occurred_at: '2026-06-10T09:30:00.000Z',
    author_id: 'u-alex',
    body: 'Telefonat geführt.',
    ai_summary: 'Telefonat geführt.',
  }

  it('resolves the author name', () => {
    const a = mapRowToActivity(row, (id) => (id === 'u-alex' ? 'Alexandra' : undefined))
    expect(a.authorName).toBe('Alexandra')
    expect(a.type).toBe('call')
  })

  it('falls back to Unbekannt when the author cannot be resolved', () => {
    const a = mapRowToActivity(row)
    expect(a.authorName).toBe('Unbekannt')
  })
})

describe('patchToRow', () => {
  it('maps editable fields to DB columns', () => {
    expect(patchToRow({ sentiment: 'green' })).toEqual({ sentiment: 'green' })
    const r = patchToRow({ linkedin: { status: 'no_account', verifiedAt: '2026-06-10' } })
    expect(r.linkedin_status).toBe('no_account')
    expect(r.linkedin_url).toBeNull()
    expect(r.linkedin_verified_at).toBe('2026-06-10')
  })

  it('omits fields that are not in the patch', () => {
    expect(patchToRow({})).toEqual({})
  })

  it('maps the full editable Stammdaten field set to columns', () => {
    const row = patchToRow({
      fullName: 'Neu Name',
      position: 'CTO',
      regionId: 'r-2',
      relationshipManagerId: 'u-2',
      team: 'Team A',
      email: 'x@example.com',
      birthday: '1980-05-05',
      location: 'Bonn',
      familyStatus: 'ledig',
      children: '1',
      pets: 'Hund',
      activeDevices: '1x iPad',
      wonCustomersCount: 7,
      freeText: 'Notiz',
      photoUrl: 'data:x',
      sentiment: 'red',
      sentimentHistory: [{ at: '2026-07-01T00:00:00.000Z', value: 'red', byName: 'A' }],
    })
    expect(row).toEqual({
      full_name: 'Neu Name',
      position: 'CTO',
      region_id: 'r-2',
      relationship_manager_id: 'u-2',
      team: 'Team A',
      email: 'x@example.com',
      birthday: '1980-05-05',
      location: 'Bonn',
      family_status: 'ledig',
      children: '1',
      pets: 'Hund',
      active_devices: '1x iPad',
      won_customers_count: 7,
      free_text: 'Notiz',
      photo_url: 'data:x',
      sentiment: 'red',
      sentiment_history: [{ at: '2026-07-01T00:00:00.000Z', value: 'red', byName: 'A' }],
    })
  })

  it('clears optional columns when the key is present but undefined', () => {
    expect(patchToRow({ team: undefined, email: undefined, birthday: undefined })).toEqual({
      team: null,
      email: null,
      birthday: null,
    })
  })

  it('writes the LinkedIn verifier id', () => {
    const r = patchToRow({
      linkedin: { status: 'no_account', verifiedById: 'u-1', verifiedAt: '2026-06-10' },
    })
    expect(r.linkedin_verified_by).toBe('u-1')
    expect(r.linkedin_verified_at).toBe('2026-06-10')
  })

  it('produces no columns for relation-only patches (sideFacts, gallery)', () => {
    expect(patchToRow({ sideFacts: [], gallery: [] })).toEqual({})
  })
})

describe('mapRowToContact gallery', () => {
  it('maps contact_photos rows to the gallery', () => {
    const c = mapRowToContact({
      ...contactRow,
      contact_photos: [{ id: 'p1', url: 'data:img', caption: 'Messe' }],
    })
    expect(c.gallery).toEqual([{ id: 'p1', url: 'data:img', caption: 'Messe' }])
  })
})
