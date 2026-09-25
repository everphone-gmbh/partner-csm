import { useMemo } from 'react'
import type { Contact } from '@/domain/types'
import { ROLE_RANK } from '@/domain/roles'
import { isInRegion } from '@/domain/contactRegions'
import { useSession } from './SessionContext'

/**
 * Applies the Account-Manager row-level region scope (mirrors the DB RLS
 * policy in supabase/migrations/0002_rls.sql) to a contact list. Privileged
 * roles (RM and above) see everything unscoped.
 *
 * Seit 0035 kann ein Kontakt zu mehreren Gebieten gehören; maßgeblich ist, ob
 * das eigene Gebiet darunter ist — genau wie can_see_contact() serverseitig.
 */
export function useScopedContacts(contacts: Contact[]) {
  const { user } = useSession()
  const isAccountManager = ROLE_RANK[user.role] === ROLE_RANK.account_manager

  const scoped = useMemo(
    () =>
      isAccountManager && user.regionId
        ? contacts.filter((c) => isInRegion(c, user.regionId!))
        : contacts,
    [contacts, isAccountManager, user.regionId],
  )

  return { scoped, isAccountManager }
}
