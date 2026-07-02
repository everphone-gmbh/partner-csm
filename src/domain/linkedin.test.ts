import { describe, it, expect } from 'vitest'
import { buildLinkedInInfo } from './linkedin'
import type { LinkedInInfo } from './types'

const ALICE = { id: 'u-alice', name: 'Alice' }
const BOB = { id: 'u-bob', name: 'Bob' }
const TODAY = '2026-07-02'

const verifiedByAlice: LinkedInInfo = {
  status: 'no_account',
  verifiedById: ALICE.id,
  verifiedByName: ALICE.name,
  verifiedAt: '2026-01-10',
}

describe('buildLinkedInInfo', () => {
  it('stamps the verifier when the status is first set', () => {
    const info = buildLinkedInInfo('no_account', '', undefined, ALICE, TODAY)
    expect(info).toEqual({
      status: 'no_account',
      verifiedById: ALICE.id,
      verifiedByName: ALICE.name,
      verifiedAt: TODAY,
    })
  })

  it('keeps the original attribution when nothing about LinkedIn changed', () => {
    // Bob saves the form for an unrelated edit — Alice's check must survive.
    const info = buildLinkedInInfo('no_account', '', verifiedByAlice, BOB, TODAY)
    expect(info.verifiedByName).toBe(ALICE.name)
    expect(info.verifiedById).toBe(ALICE.id)
    expect(info.verifiedAt).toBe('2026-01-10')
  })

  it('re-stamps when the status actually changes', () => {
    const info = buildLinkedInInfo('has_account', 'https://linkedin.com/in/x', verifiedByAlice, BOB, TODAY)
    expect(info.verifiedByName).toBe(BOB.name)
    expect(info.verifiedAt).toBe(TODAY)
    expect(info.url).toBe('https://linkedin.com/in/x')
  })

  it('re-stamps when the URL changes on an existing has_account state', () => {
    const prev: LinkedInInfo = { ...verifiedByAlice, status: 'has_account', url: 'https://linkedin.com/in/old' }
    const info = buildLinkedInInfo('has_account', 'https://linkedin.com/in/new', prev, BOB, TODAY)
    expect(info.verifiedByName).toBe(BOB.name)
  })

  it('carries no attribution for the unknown state', () => {
    const info = buildLinkedInInfo('unknown', '', verifiedByAlice, BOB, TODAY)
    expect(info).toEqual({ status: 'unknown' })
  })

  it('trims and drops the URL unless the status is has_account', () => {
    const info = buildLinkedInInfo('no_account', 'https://ignored.example', undefined, ALICE, TODAY)
    expect(info.url).toBeUndefined()
    const withUrl = buildLinkedInInfo('has_account', '  https://linkedin.com/in/x  ', undefined, ALICE, TODAY)
    expect(withUrl.url).toBe('https://linkedin.com/in/x')
  })
})
