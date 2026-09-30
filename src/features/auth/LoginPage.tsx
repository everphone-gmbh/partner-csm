import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { FieldHint, Notice } from '@/components/ui/notice'
import { AuthCard, AuthShell } from './AuthShell'
import { GoogleLogo } from './GoogleLogo'
import { friendlyReturnError, GOOGLE_LOGIN_LIVE, googleLoginVisible, RETURN_ERROR } from './googleLogin'

const inputCls =
  'h-10 w-full rounded-[10px] border border-transparent bg-secondary px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Anmeldung gegen Supabase Auth. Google ist der Weg hinein (Pflicht seit 29.09.);
 * die Passwort-Anmeldung liegt eingeklappt darunter, bis sie abgeschaltet wird.
 * Neue Google-Konten warten danach auf Freischaltung (0040).
 */
export function LoginPage() {
  const showGoogle = googleLoginVisible()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordOpen, setPasswordOpen] = useState(!showGoogle)
  const [error, setError] = useState<string | undefined>(() =>
    RETURN_ERROR ? friendlyReturnError(RETURN_ERROR) : undefined,
  )
  const [missing, setMissing] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState<'google' | 'password' | undefined>(undefined)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  // Die Fehlerangabe nicht in der Adresse stehen lassen — sonst erscheint sie
  // nach dem Neuladen wieder.
  useEffect(() => {
    if (RETURN_ERROR && (window.location.hash || window.location.search.includes('error'))) {
      const keep = showGoogle && !GOOGLE_LOGIN_LIVE ? '?google=1' : ''
      window.history.replaceState(null, '', `${window.location.pathname}${keep}`)
    }
  }, [showGoogle])

  const signInWithGoogle = async () => {
    setBusy('google')
    setError(undefined)
    try {
      const { supabase } = await import('@/lib/supabase')
      if (!supabase) throw new Error('Backend nicht konfiguriert')
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
      })
      if (authError) {
        setError(friendlyReturnError(authError.message))
        setBusy(undefined)
      }
      // Erfolg: der Browser geht zu Google und kommt mit der Sitzung zurück —
      // bis dahin bleibt „Weiter zu Google…" stehen.
    } catch (err) {
      setError(friendlyReturnError(err instanceof Error ? err.message : String(err)))
      setBusy(undefined)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    // Knopf bleibt klickbar und sagt, was fehlt — statt still gesperrt zu sein.
    if (!email.trim()) {
      setMissing('Gib deine E-Mail-Adresse ein.')
      emailRef.current?.focus()
      return
    }
    if (!password) {
      setMissing('Gib dein Passwort ein.')
      passwordRef.current?.focus()
      return
    }
    setMissing(undefined)
    setBusy('password')
    setError(undefined)
    try {
      const { supabase } = await import('@/lib/supabase')
      if (!supabase) throw new Error('Backend nicht konfiguriert')
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) {
        if (authError.message === 'Invalid login credentials') setError('E-Mail oder Passwort ist falsch.')
        else {
          console.warn('[Anmeldung] Originaltext:', authError.message)
          setError('Die Anmeldung hat nicht geklappt. Versuch es noch einmal.')
        }
      }
      // Erfolg: onAuthStateChange im SessionProvider übernimmt.
    } catch (err) {
      console.warn('[Anmeldung] Originaltext:', err)
      setError('Die Anmeldung hat nicht geklappt. Versuch es noch einmal.')
    } finally {
      setBusy(undefined)
    }
  }

  const passwordForm = (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="login-email">E-Mail</Label>
        <input
          ref={emailRef}
          id="login-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setMissing(undefined)
          }}
          className={inputCls}
          placeholder="vorname.nachname@everphone.de"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="login-password">Passwort</Label>
        <input
          ref={passwordRef}
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setMissing(undefined)
          }}
          className={inputCls}
        />
      </div>
      {missing && <FieldHint>{missing}</FieldHint>}
      <Button
        type="submit"
        variant={showGoogle ? 'outline' : 'default'}
        className="w-full"
        disabled={busy !== undefined}
      >
        {busy === 'password' ? 'Anmelden…' : 'Anmelden'}
      </Button>
    </form>
  )

  return (
    <AuthShell
      footer={
        showGoogle
          ? 'Nur für das Partnerships-Team. Neu dabei? Mit Google anmelden, danach schaltet die Leitung dich frei.'
          : 'Nur für das Partnerships-Team. Bei Fragen: Jannik Heeland.'
      }
    >
      <AuthCard>
        <div className="space-y-2.5 p-5">
          {error && <Notice tone="error">{error}</Notice>}
          {showGoogle ? (
            <>
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={busy !== undefined}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-google-stroke bg-google-fill text-sm font-medium text-google-text transition-colors hover:bg-google-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
              >
                <GoogleLogo className="size-[18px] shrink-0" />
                {busy === 'google' ? 'Weiter zu Google…' : 'Mit Google anmelden'}
              </button>
              <p className="text-center text-[13px] leading-[18px] text-muted-foreground">
                Wähle bei Google dein Konto mit <span className="font-medium text-foreground">@everphone.de</span>.
              </p>
            </>
          ) : (
            passwordForm
          )}
        </div>
        {showGoogle && (
          <div className="border-t border-border/70">
            <button
              type="button"
              aria-expanded={passwordOpen}
              onClick={() => setPasswordOpen((open) => !open)}
              className="flex h-11 w-full items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              Mit Passwort anmelden
              {passwordOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
            {passwordOpen && <div className="px-5 pb-5">{passwordForm}</div>}
          </div>
        )}
      </AuthCard>
    </AuthShell>
  )
}
