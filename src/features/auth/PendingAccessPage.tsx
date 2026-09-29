import { Button } from '@/components/ui/button'

/**
 * Angemeldet, aber noch nicht freigeschaltet (Migration 0040): wer sich per
 * Google anmeldet, hat eine Sitzung, aber kein Profil — und sieht bis zur
 * Freischaltung durch die Leitung nichts. Vorher blieb die App hier
 * stillschweigend bei „Lädt…" stehen.
 */
export function PendingAccessPage({ email, onSignOut }: { email?: string; onSignOut: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">
            P
          </span>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Partner CSM</h1>
        </div>
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5 text-sm shadow-sm">
          <h2 className="text-base font-semibold">Dein Zugang wartet auf Freischaltung</h2>
          <p className="text-muted-foreground">
            {email ? (
              <>
                Du bist als <span className="font-medium text-foreground">{email}</span> angemeldet.{' '}
              </>
            ) : null}
            Neue Konten schaltet die Leitung im Bereich „Team" frei — sag Jannik Heeland kurz
            Bescheid. Danach die Seite neu laden.
          </p>
          <div className="flex gap-2 pt-1">
            <Button type="button" className="flex-1" onClick={() => window.location.reload()}>
              Neu laden
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={onSignOut}>
              Abmelden
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
