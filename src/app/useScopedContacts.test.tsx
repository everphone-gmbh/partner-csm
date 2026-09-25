import { describe, it, expect } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useScopedContacts } from './useScopedContacts'
import { SessionProvider, useSession } from './SessionContext'
import type { Contact } from '@/domain/types'

function contact(id: string, regionId: string): Contact {
  return {
    id,
    fullName: id,
    position: 'p',
    regionId,
    relationshipManagerId: 'u',
    linkedin: { status: 'unknown' },
    sentiment: 'neutral',
    wonCustomersCount: 0,
    sideFacts: [],
    customers: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const contacts = [contact('c1', 'r-nord'), contact('c2', 'r-nord'), contact('c3', 'r-west')]

function wrapper({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}

describe('useScopedContacts', () => {
  // SessionProvider loads users from the repository asynchronously, so the
  // hook under test renders only after the session has booted.
  it('does not scope for privileged roles (default seeded user is overall_admin)', async () => {
    const { result } = renderHook(() => useScopedContacts(contacts), { wrapper })
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current.isAccountManager).toBe(false)
    expect(result.current.scoped).toHaveLength(3)
  })

  it('scopes to the account manager region', async () => {
    const { result } = renderHook(
      () => {
        const session = useSession()
        return { session, ...useScopedContacts(contacts) }
      },
      { wrapper },
    )
    await waitFor(() => expect(result.current).not.toBeNull())
    // Switch to Mehmet Yıldız, an account_manager in r-west (see data/seed.ts).
    act(() => result.current.session.setUserId('u-mehmet'))

    await waitFor(() => expect(result.current.isAccountManager).toBe(true))
    expect(result.current.scoped).toHaveLength(1)
    expect(result.current.scoped[0].id).toBe('c3')
  })
})

// --- Mehrere Gebiete je Kontakt (Migration 0035) ---------------------------

describe('useScopedContacts mit mehreren Gebieten', () => {
  it('zeigt dem Account Manager auch einen Kontakt, der sein Gebiet als ZWEITES trägt', async () => {
    // Der gemeldete Fall: eine Teamassistenz ist in Süd geführt, betreut aber
    // auch West. Der Account Manager in West muss sie sehen.
    const assistenz: Contact = {
      ...contact('c-assistenz', 'r-sued'),
      regionIds: ['r-sued', 'r-west'],
    }
    const { result } = renderHook(
      () => {
        const session = useSession()
        return { session, ...useScopedContacts([...contacts, assistenz]) }
      },
      { wrapper },
    )
    await waitFor(() => expect(result.current).not.toBeNull())
    act(() => result.current.session.setUserId('u-mehmet')) // account_manager in r-west
    await waitFor(() => expect(result.current.isAccountManager).toBe(true))

    expect(result.current.scoped.map((c) => c.id).sort()).toEqual(['c-assistenz', 'c3'])
  })

  it('blendet einen Kontakt weiterhin aus, dessen Gebiete beide fremd sind', async () => {
    const fremd: Contact = { ...contact('c-fremd', 'r-sued'), regionIds: ['r-sued', 'r-nord'] }
    const { result } = renderHook(
      () => {
        const session = useSession()
        return { session, ...useScopedContacts([fremd]) }
      },
      { wrapper },
    )
    await waitFor(() => expect(result.current).not.toBeNull())
    act(() => result.current.session.setUserId('u-mehmet'))
    await waitFor(() => expect(result.current.isAccountManager).toBe(true))

    expect(result.current.scoped).toHaveLength(0)
  })
})
