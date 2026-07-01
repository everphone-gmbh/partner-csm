import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
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
  it('does not scope for privileged roles (default seeded user is overall_admin)', () => {
    const { result } = renderHook(() => useScopedContacts(contacts), { wrapper })
    expect(result.current.isAccountManager).toBe(false)
    expect(result.current.scoped).toHaveLength(3)
  })

  it('scopes to the account manager region', () => {
    const { result } = renderHook(
      () => {
        const session = useSession()
        return { session, ...useScopedContacts(contacts) }
      },
      { wrapper },
    )
    // Switch to Mehmet Yıldız, an account_manager in r-west (see data/seed.ts).
    act(() => result.current.session.setUserId('u-mehmet'))

    expect(result.current.isAccountManager).toBe(true)
    expect(result.current.scoped).toHaveLength(1)
    expect(result.current.scoped[0].id).toBe('c3')
  })
})
