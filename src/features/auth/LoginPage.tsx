import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { friendlyReturnError, GOOGLE_LOGIN_LIVE, googleLoginVisible, RETURN_ERROR } from './googleLogin'

const inputCls =
  'h-10 w-full rounded-[10px] border border-transparent bg-secondary px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'


/**
 * Anmeldung gegen Supabase Auth: mit Google (siehe oben) oder mit E-Mail und
 * Passwort. Neue Google-Konten warten danach auf Freischaltung (0040).
 */
export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>(() =>
    RETURN_ERROR ? friendlyReturnError(RETURN_ERROR) : undefined,
  )
  const [busy, setBusy] = useState(false)
  const showGoogle = googleLoginVisible()

  // Die Fehlerangabe nicht in der Adresse stehen lassen — sonst erscheint sie
  // nach dem Neuladen wieder.
  useEffect(() => {
    if (RETURN_ERROR && (window.location.hash || window.location.search.includes('error'))) {
      const keep = showGoogle && !GOOGLE_LOGIN_LIVE ? '?google=1' : ''
      window.history.replaceState(null, '', `${window.location.pathname}${keep}`)
    }
  }, [showGoogle])

  const signInWithGoogle = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const { supabase } = await import('@/lib/supabase')
      if (!supabase) throw new Error('Backend nicht konfiguriert')
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
      })
      if (authError) setError(friendlyReturnError(authError.message))
      // Erfolg: der Browser geht zu Google und kommt mit der Sitzung zurück.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      const { supabase } = await import('@/lib/supabase')
      if (!supabase) throw new Error('Backend nicht konfiguriert')
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) {
        setError(
          authError.message === 'Invalid login credentials'
            ? 'E-Mail oder Passwort ist falsch.'
            : authError.message,
        )
      }
      // Erfolg: onAuthStateChange im SessionProvider übernimmt.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">
            P
          </span>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Partner CSM</h1>
          <p className="text-sm text-muted-foreground">Telekom Partnerschaften</p>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          {showGoogle && (
            <>
              <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={signInWithGoogle}>
                Mit Google anmelden
              </Button>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                oder mit Passwort
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label htmlFor="login-email">E-Mail</Label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="vorname.nachname@everphone.de"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="login-password">Passwort</Label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
          </div>
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy || !email || !password}>
            {busy ? 'Anmelden…' : 'Anmelden'}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          Zugang nur für das Partnerships-Team. Bei Fragen: Jannik Heeland.
        </p>
      </div>
    </div>
  )
}
