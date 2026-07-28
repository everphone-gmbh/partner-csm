import { useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Mindestlänge; Supabase lehnt kürzere Passwörter ohnehin ab. */
const MIN_LENGTH = 10

/**
 * Passwort ändern für den angemeldeten Nutzer.
 *
 * Nötig, weil die Erstpasswörter beim Rollout aus einer Liste verteilt wurden —
 * bis hierhin konnte sie niemand ersetzen. Supabase verlangt für
 * `updateUser` eine gültige Sitzung; ein zusätzlicher Login mit dem alten
 * Passwort davor stellt sicher, dass eine offen stehende Sitzung nicht genügt.
 */
export function ChangePasswordCard({ email }: { email?: string }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [done, setDone] = useState(false)

  const tooShort = next.length > 0 && next.length < MIN_LENGTH
  const mismatch = repeat.length > 0 && next !== repeat
  const canSubmit =
    current.length > 0 && next.length >= MIN_LENGTH && next === repeat && !busy

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    setDone(false)
    try {
      const { supabase } = await import('@/lib/supabase')
      if (!supabase) throw new Error('Backend nicht konfiguriert')

      // Erst das alte Passwort bestätigen — sonst könnte jemand an einem
      // offenen Rechner das Passwort ohne Kenntnis des alten ändern.
      if (email) {
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email,
          password: current,
        })
        if (reauthError) {
          setError('Das aktuelle Passwort ist nicht korrekt.')
          return
        }
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: next })
      if (updateError) {
        setError(
          /same/i.test(updateError.message)
            ? 'Das neue Passwort entspricht dem alten.'
            : updateError.message,
        )
        return
      }
      setDone(true)
      setCurrent('')
      setNext('')
      setRepeat('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-muted-foreground" /> Passwort ändern
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="max-w-sm space-y-3">
          <div className="space-y-1">
            <Label htmlFor="pw-current">Aktuelles Passwort</Label>
            <Input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pw-new">Neues Passwort</Label>
            <Input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Mindestens {MIN_LENGTH} Zeichen. Eine Merkphrase aus mehreren Wörtern ist sicherer
              als ein kurzes Sonderzeichen-Kürzel.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pw-repeat">Neues Passwort wiederholen</Label>
            <Input
              id="pw-repeat"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </div>

          {tooShort && (
            <p className="text-xs text-destructive">
              Noch zu kurz — {MIN_LENGTH} Zeichen sind das Minimum.
            </p>
          )}
          {mismatch && (
            <p className="text-xs text-destructive">Die beiden Eingaben stimmen nicht überein.</p>
          )}
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {done && (
            <p className="rounded-md border border-status-green/30 bg-status-green/10 px-3 py-2 text-xs text-foreground">
              Passwort geändert. Es gilt ab der nächsten Anmeldung.
            </p>
          )}

          <Button type="submit" disabled={!canSubmit}>
            {busy ? 'Ändern…' : 'Passwort ändern'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
