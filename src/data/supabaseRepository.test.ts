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
  email: 'anke@example.com',
  birthday: '1979-07-03',
  location: 'Hamburg',
  family_status: 'verheiratet',
  children: '2',
  pets: null,
  linkedin_status: 'no_account',
  linkedin_url: null,
  linkedin_verified_by: 'u-alex',
  linkedin_verified_at: '2026-05-20',
  sentiment: 'green',
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
})
