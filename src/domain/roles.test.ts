import { describe, it, expect } from 'vitest'
import {
  canApprove,
  canViewActivityBody,
  canViewAnalytics,
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
  gallery: [{ id: 'ph1', url: 'data:image/jpeg;x', caption: 'Messe' }],
  phoneWork: '+49 40 123456-0',
  phoneMobile: '+49 170 1234567',
  phonePrivate: '+49 40 999999',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('canViewAnalytics — Bericht/Abdeckung/Monitoring nur für den Head', () => {
  it('lässt nur den Overall Admin durch', () => {
    expect(canViewAnalytics('overall_admin')).toBe(true)
    expect(canViewAnalytics('sub_admin')).toBe(false)
    expect(canViewAnalytics('account_manager')).toBe(false)
  })

  it('nimmt dem RM NICHT das Bearbeiten (canApprove bleibt getrennt)', () => {
    // Kernpunkt der Trennung: RM verliert die Auswertungen, behält aber die
    // Bearbeitungsrechte.
    expect(canApprove('sub_admin')).toBe(true)
    expect(canViewAnalytics('sub_admin')).toBe(false)
  })
})

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

  it('strips only the PRIVATE phone number, not the business ones', () => {
    // Die Stufung ist der Kern: eine Dienstnummer ist Geschäftsdatum wie die
    // E-Mail, die private Nummer gehört zur Privatsphäre. Serverseitig steht
    // dasselbe im is_privileged()-Block der View contact_cards (Migration 0025) —
    // weicht eine der beiden Ebenen ab, filtert nur noch die andere.
    const r = redactContactForRole(base, 'account_manager')
    expect(r.phonePrivate).toBeUndefined()
    expect(r.phoneWork).toBe('+49 40 123456-0')
    expect(r.phoneMobile).toBe('+49 170 1234567')
    expect(r.email).toBe(base.email)
  })

  it('keeps the private phone number for privileged roles', () => {
    expect(redactContactForRole(base, 'sub_admin').phonePrivate).toBe('+49 40 999999')
  })

  it('strips private photos (gallery) for the account-manager tier', () => {
    const r = redactContactForRole(base, 'account_manager')
    expect(r.gallery ?? []).toHaveLength(0)
  })

  it('keeps the gallery for privileged roles', () => {
    expect(redactContactForRole(base, 'sub_admin').gallery).toHaveLength(1)
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
