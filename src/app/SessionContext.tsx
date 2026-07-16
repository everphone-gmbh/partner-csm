import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppUser } from '@/domain/types'
import { activeBackend, repository } from '@/data/repositoryProvider'
import { LoginPage } from '@/features/auth/LoginPage'

interface SessionValue {
  user: AppUser
  users: AppUser[]
  /** Mock-Demo: Rolle wechseln. Im Supabase-Modus ohne Wirkung (RLS zählt). */
  setUserId: (id: string) => void
  /** true nur im Mock-Modus — dort gibt es den „Ansicht als…“-Umschalter. */
  canSwitchUser: boolean
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

type AuthState = 'loading' | 'signedOut' | 'signedIn'

/**
 * Mock-Modus: Demo-Session mit Rollen-Umschalter (kein Login).
 * Supabase-Modus: echte Supabase-Auth-Session; ohne Session erscheint die
 * Login-Seite. Der angemeldete Nutzer ist das eigene Profil (auth.uid),
 * die Datensicht erzwingt serverseitig RLS — nicht der Client.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const supabaseMode = activeBackend === 'supabase'
  const [auth, setAuth] = useState<AuthState>(supabaseMode ? 'loading' : 'signedIn')
  const [authUserId, setAuthUserId] = useState<string | undefined>(undefined)
  const [users, setUsers] = useState<AppUser[]>([])
  const [userId, setUserId] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  // Supabase: Session beobachten (Login/Logout/Token-Refresh).
  useEffect(() => {
    if (!supabaseMode) return
    let active = true
    let unsubscribe: (() => void) | undefined
    import('@/lib/supabase').then(({ supabase }) => {
      if (!active || !supabase) return
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!active) return
        setAuthUserId(session?.user.id)
        setAuth(session ? 'signedIn' : 'signedOut')
      })
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return
        setAuthUserId(session?.user.id)
        setAuth(session ? 'signedIn' : 'signedOut')
        if (!session) setUsers([])
      })
      unsubscribe = () => data.subscription.unsubscribe()
    })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [supabaseMode])

  // Nutzerliste laden, sobald (im Supabase-Modus: nach Login) Zugriff besteht.
  useEffect(() => {
    if (auth !== 'signedIn') return
    let active = true
    repository.listUsers().then(
      (u) => {
        if (!active) return
        setUsers(u)
        setUserId((id) => id ?? (supabaseMode ? authUserId : u[0]?.id))
      },
      (err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err))
      },
    )
    return () => {
      active = false
    }
  }, [auth, authUserId, supabaseMode])

  const signOut = useMemo(
    () => async () => {
      if (!supabaseMode) return
      const { supabase } = await import('@/lib/supabase')
      await supabase?.auth.signOut()
      setUserId(undefined)
    },
    [supabaseMode],
  )

  const user = useMemo(() => {
    if (supabaseMode) return users.find((u) => u.id === authUserId)
    return users.find((u) => u.id === userId) ?? users[0]
  }, [supabaseMode, users, userId, authUserId])

  const value = useMemo<SessionValue>(
    () => ({ user: user as AppUser, users, setUserId, canSwitchUser: !supabaseMode, signOut }),
    [user, users, supabaseMode, signOut],
  )

  if (supabaseMode && auth === 'signedOut') return <LoginPage />
  if (error) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Anmeldedaten konnten nicht geladen werden: {error}
      </p>
    )
  }
  if (auth === 'loading' || users.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Lädt…</p>
  }
  if (!user) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Für dieses Konto existiert kein Profil. Bitte bei Jannik Heeland melden.
      </p>
    )
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
