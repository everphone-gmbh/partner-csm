import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuthCard, AuthShell } from './AuthShell'

/**
 * Angemeldet, aber noch nicht freigeschaltet (Migration 0040): wer sich per
 * Google anmeldet, hat eine Sitzung, aber kein Profil — und sieht bis zur
 * Freischaltung durch die Leitung nichts. Die Seite zeigt den Weg wie eine
 * Sendungsverfolgung: erledigt, gerade dran, als Nächstes. Nach der
 * Freischaltung geht es von selbst weiter (der SessionProvider prüft nach).
 */
export function PendingAccessPage({ email, onSignOut }: { email?: string; onSignOut: () => void }) {
  return (
    <AuthShell>
      <AuthCard>
        <div className="p-5">
          <h2 className="text-[17px] font-semibold leading-[22px] tracking-tight">
            Dein Zugang wartet auf Freischaltung
          </h2>
          <ol className="mt-4">
            <Step state="done" title="Mit Google angemeldet">
              {email ? (
                <>
                  als <span>{email}</span>
                </>
              ) : (
                'mit deinem Everphone-Konto'
              )}
            </Step>
            <Step state="now" title="Die Leitung schaltet dich frei">
              Sag Jannik Heeland kurz Bescheid.
            </Step>
            <Step state="next" title="Du siehst die Kontakte" last>
              Es geht dann von selbst weiter.
            </Step>
          </ol>
        </div>
        <div className="flex items-center justify-center gap-0.5 border-t border-border/70 text-sm text-muted-foreground">
          <span>Falsches Konto?</span>
          <button
            type="button"
            onClick={onSignOut}
            className="h-11 px-1.5 font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Abmelden
          </button>
        </div>
      </AuthCard>
    </AuthShell>
  )
}

type StepState = 'done' | 'now' | 'next'

const STATE_LABEL: Record<StepState, string> = {
  done: 'Erledigt',
  now: 'Gerade dran',
  next: 'Als Nächstes',
}

function Step({
  state,
  title,
  children,
  last = false,
}: {
  state: StepState
  title: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <li className="flex gap-3" aria-current={state === 'now' ? 'step' : undefined}>
      <div className="flex w-7 shrink-0 flex-col items-center">
        <span
          aria-hidden
          className={cn(
            'flex size-7 items-center justify-center rounded-full border',
            state === 'done' && 'border-success-line bg-success-soft text-success-ink',
            state === 'now' && 'border-2 border-status-amber bg-warning-soft',
            state === 'next' && 'border-[1.5px] border-border bg-card',
          )}
        >
          {state === 'done' && <Check className="size-3.5" strokeWidth={3} />}
          {state === 'now' && <span className="size-2 rounded-full bg-status-amber" />}
        </span>
        {!last && (
          <span
            aria-hidden
            className={cn(
              'my-1 min-h-3 w-0.5 flex-1 rounded-full',
              state === 'done' ? 'bg-success-line' : 'bg-border',
            )}
          />
        )}
      </div>
      <div className={cn('min-w-0 pt-1', !last && 'pb-5')}>
        <p className={cn('text-sm font-semibold', state === 'next' && 'text-muted-foreground')}>
          <span className="sr-only">{STATE_LABEL[state]}: </span>
          {title}
        </p>
        <p className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">{children}</p>
      </div>
    </li>
  )
}
