import { useMemo } from 'react'
import type { Contact } from '@/domain/types'
import { ROLE_RANK } from '@/domain/roles'
import { useSession } from './SessionContext'

/**
 * Applies the Account-Manager row-level region scope (mirrors the DB RLS
 * policy in supabase/migrations/0002_rls.sql) to a contact list. Privileged
 * roles (RM and above) see everything unscoped.
 */
export function useScopedContacts(contacts: Contact[]) {
  const { user } = useSession()
  const isAccountManager = ROLE_RANK[user.role] === ROLE_RANK.account_manager

  const scoped = useMemo(
    () =>
      isAccountManager && user.regionId
        ? contacts.filter((c) => c.regionId === user.regionId)
        : contacts,
    [contacts, isAccountManager, user.regionId],
  )

  return { scoped, isAccountManager }
}
