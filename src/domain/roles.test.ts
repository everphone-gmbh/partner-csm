import { describe, it, expect } from 'vitest'
import {
  canApprove,
  canViewActivityBody,
  canViewSensitiveFields,
  redactContactForRole,
} from './roles'
import type { Contact } from './types'

const base: Contact = {
  id: 'c-test',
  fullName: 'Test Person',
  position: 'Head of Test',
  regionId: 'r-nord',
  relationshipManagerId: 'u-alex',
  email: 'test@example.com',
  birthday: '1980-01-01',
  location: 'Berlin',
  familyStatus: 'verheiratet',
  children: '2',
  pets: 'Katze',
  linkedin: { status: 'has_account', url: 'https://x' },
  sentiment: 'green',
  activeDevices: '1× iPhone',
  wonCustomersCount: 3,
  freeText: 'Interne Notiz',
  sideFacts: [{ id: 'sf1', label: 'Segeln', category: 'sport' }],
  customers: [{ id: 'cu1', name: 'ACME', withUs: true }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('role-based field visibility', () => {
  it('strips personal fields for the account-manager tier', () => {
    const r = redactContactForRole(base, 'account_manager')
    expect(r.birthday).toBeUndefined()
    expect(r.location).toBeUndefined()
    expect(r.familyStatus).toBeUndefined()
    expect(r.children).toBeUndefined()
    expect(r.pets).toBeUndefined()
    expect(r.freeText).toBeUndefined()
    expect(r.activeDevices).toBeUndefined()
    expect(r.sideFacts).toHaveLength(0)
  })

  it('keeps professional fields for the account-manager tier', () => {
    const r = redactContactForRole(base, 'account_manager')
    expect(r.fullName).toBe(base.fullName)
    expect(r.position).toBe(base.position)
    expect(r.email).toBe(base.email)
    expect(r.customers).toHaveLength(base.customers.length)
    expect(r.wonCustomersCount).toBe(base.wonCustomersCount)
    expect(r.linkedin.status).toBe('has_account')
  })

  it('does not redact for privileged roles', () => {
    for (const role of ['sub_admin', 'overall_admin'] as const) {
      const r = redactContactForRole(base, role)
      expect(r.birthday).toBe(base.birthday)
      expect(r.freeText).toBe(base.freeText)
      expect(r.sideFacts).toHaveLength(base.sideFacts.length)
    }
  })

  it('gates capabilities by rank', () => {
    expect(canViewSensitiveFields('account_manager')).toBe(false)
    expect(canViewSensitiveFields('sub_admin')).toBe(true)
    expect(canViewSensitiveFields('overall_admin')).toBe(true)

    expect(canViewActivityBody('account_manager')).toBe(false)
    expect(canViewActivityBody('sub_admin')).toBe(true)

    expect(canApprove('account_manager')).toBe(false)
    expect(canApprove('overall_admin')).toBe(true)
  })
})
