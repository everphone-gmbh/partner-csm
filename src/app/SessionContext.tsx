import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppUser } from '@/domain/types'
import { activeBackend, repository } from '@/data/repositoryProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { PendingAccessPage } from '@/features/auth/PendingAccessPage'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'

interface SessionValue {
  user: AppUser
  users: AppUser[]
  /** E-Mail der Anmeldung; im Mock-Modus undefined. */
  email?: string
  /** Mock-Demo: Rolle wechseln. Im Supabase-Modus ohne Wirkung (RLS zählt). */
  setUserId: (id: string) => void
  /** true nur im Mock-Modus — dort gibt es den „Ansicht als…“-Umschalter. */
  canSwitchUser: boolean
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

type AuthState = 'loading' | 'signedOut' | 'signedIn'

/** Wie oft ein wartendes Konto nachsieht, ob es freigeschaltet ist. */
const PENDING_RECHECK_MS = 20_000

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
  const [authEmail, setAuthEmail] = useState<string | undefined>(undefined)
  const [users, setUsers] = useState<AppUser[]>([])
  // Getrennt von `users`: eine leere Liste heißt nicht „lädt noch". Ein Konto
  // ohne Profil (per Google angemeldet, noch nicht freigeschaltet, 0040) sieht
  // keine Profile — vorher blieb die App dann für immer bei „Lädt…".
  const [usersLoaded, setUsersLoaded] = useState(false)
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
        setAuthEmail(session?.user.email ?? undefined)
        setAuth(session ? 'signedIn' : 'signedOut')
      })
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return
        setAuthUserId(session?.user.id)
        setAuthEmail(session?.user.email ?? undefined)
        setAuth(session ? 'signedIn' : 'signedOut')
        if (!session) {
          setUsers([])
          setUsersLoaded(false)
        }
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
        setUsersLoaded(true)
        setUserId((id) => id ?? (supabaseMode ? authUserId : u[0]?.id))
      },
      (err: unknown) => {
        if (!active) return
        console.warn('[Sitzung] Nutzerliste nicht geladen:', err)
        setError(err instanceof Error ? err.message : String(err))
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

  // Wartet das Konto auf Freischaltung, schaut die App selbst nach — alle 20 s
  // und sobald der Tab wieder vorn ist. Vorher musste man „Neu laden" drücken
  // und wusste nicht, wann.
  const pending = supabaseMode && auth === 'signedIn' && usersLoaded && !user
  useEffect(() => {
    if (!pending) return
    let active = true
    const recheck = () => {
      repository.listUsers().then(
        (u) => {
          if (active && u.some((x) => x.id === authUserId)) setUsers(u)
        },
        () => {
          // Beim nächsten Durchgang noch einmal; die Warte-Seite bleibt stehen.
        },
      )
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') recheck()
    }
    const timer = window.setInterval(recheck, PENDING_RECHECK_MS)
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', recheck)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pending, authUserId])

  const value = useMemo<SessionValue>(
    () => ({
      user: user as AppUser,
      users,
      email: authEmail,
      setUserId,
      canSwitchUser: !supabaseMode,
      signOut,
    }),
    [user, users, authEmail, supabaseMode, signOut],
  )

  if (supabaseMode && auth === 'signedOut') return <LoginPage />
  if (error) {
    return (
      <div className="mx-auto max-w-sm space-y-3 px-4 py-16">
        <Notice tone="error">
          Deine Anmeldung konnte nicht geladen werden. Lade die Seite neu. Klappt es wieder nicht,
          melde dich bei Jannik Heeland.
        </Notice>
        <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
          Neu laden
        </Button>
      </div>
    )
  }
  if (auth === 'loading' || !usersLoaded) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Lädt…</p>
  }
  if (!user) {
    // Angemeldet, aber ohne Profil: wartet auf Freischaltung durch die Leitung.
    return <PendingAccessPage email={authEmail} onSignOut={() => void signOut()} />
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
