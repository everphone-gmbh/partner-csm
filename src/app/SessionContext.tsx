import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppUser } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'

interface SessionValue {
  user: AppUser
  users: AppUser[]
  setUserId: (id: string) => void
}

const SessionContext = createContext<SessionValue | null>(null)

/**
 * Demo session. The role switcher swaps the "logged-in" user so the team can
 * see the 3-tier redaction live. Replaced by Supabase Auth + profiles later.
 *
 * Users come from the Repository (not a hard seed import), so the session
 * works against whichever backend is active and the seed data isn't pulled
 * into the bundle unconditionally.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<AppUser[]>([])
  const [userId, setUserId] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let active = true
    repository.listUsers().then(
      (u) => {
        if (!active) return
        setUsers(u)
        setUserId((id) => id ?? u[0]?.id)
      },
      (err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err))
      },
    )
    return () => {
      active = false
    }
  }, [])

  const user = useMemo(
    () => users.find((u) => u.id === userId) ?? users[0],
    [users, userId],
  )
  const value = useMemo<SessionValue>(
    () => ({ user, users, setUserId }),
    [user, users],
  )

  if (error) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Anmeldedaten konnten nicht geladen werden: {error}
      </p>
    )
  }
  if (!user) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Lädt…</p>
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
