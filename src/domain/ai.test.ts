import { describe, it, expect } from 'vitest'
import { localSummarizer } from './ai'
import { redactContactForRole } from './roles'
import type { Contact } from './types'

const base: Contact = {
  id: 'c-test',
  fullName: 'Anke Richter',
  position: 'Leiterin Partner Management',
  regionId: 'r-nord',
  relationshipManagerId: 'u-alex',
  linkedin: { status: 'has_account' },
  sentiment: 'green',
  wonCustomersCount: 2,
  freeText: 'Notiz',
  sideFacts: [{ id: 'sf1', label: 'Segeln', category: 'sport' }],
  customers: [
    { id: 'cu1', name: 'ACME', withUs: true },
    { id: 'cu2', name: 'Beta', withUs: false },
  ],
  birthday: '1980-01-01',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('localSummarizer.contactIntro', () => {
  it('includes name and position', () => {
    const s = localSummarizer.contactIntro(base, { regionName: 'Nord', managerName: 'Alex' })
    expect(s).toContain('Anke Richter')
    expect(s).toContain('Leiterin Partner Management')
    expect(s).toContain('Nord')
  })

  it('mentions side facts for privileged data but not after redaction', () => {
    expect(localSummarizer.contactIntro(base)).toContain('Anknüpfungspunkte')
    const redacted = redactContactForRole(base, 'account_manager')
    expect(localSummarizer.contactIntro(redacted)).not.toContain('Anknüpfungspunkte')
  })
})

describe('localSummarizer.activitySummary', () => {
  it('clips to the first sentence', () => {
    const s = localSummarizer.activitySummary({ type: 'note', body: 'Erstes. Zweites.' })
    expect(s).toBe('Erstes.')
  })

  it('returns empty string for empty input', () => {
    expect(localSummarizer.activitySummary({ type: 'note', body: '   ' })).toBe('')
  })
})
