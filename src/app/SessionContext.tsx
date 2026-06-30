import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { AppUser } from '@/domain/types'
import { seedUsers } from '@/data/seed'

interface SessionValue {
  user: AppUser
  users: AppUser[]
  setUserId: (id: string) => void
}

const SessionContext = createContext<SessionValue | null>(null)

/**
 * Demo session. The role switcher swaps the "logged-in" user so the team can
 * see the 3-tier redaction live. Replaced by Supabase Auth + profiles later.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState(seedUsers[0].id)
  const user = useMemo(
    () => seedUsers.find((u) => u.id === userId) ?? seedUsers[0],
    [userId],
  )
  const value = useMemo<SessionValue>(
    () => ({ user, users: seedUsers, setUserId }),
    [user],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
