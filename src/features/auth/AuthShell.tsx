import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Rahmen der Seiten vor der App (Login, Warte-Seite): Marke oben, eine Karte,
 * darunter eine Zeile Kleingedrucktes. Beide Seiten sehen so gleich aus — wer
 * nach der Google-Anmeldung auf der Warte-Seite landet, ist sichtbar noch am
 * selben Ort.
 */
export function AuthShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">
            P
          </span>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Partner CSM</h1>
          <p className="text-sm text-muted-foreground">Telekom Partnerschaften</p>
        </div>
        {children}
        {footer && <p className="text-balance text-center text-[13px] leading-[18px] text-muted-foreground">{footer}</p>}
      </div>
    </div>
  )
}

/** Die Karte im Rahmen; `overflow-hidden`, damit eine Fußzeile bis an den Rand reicht. */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-black/[0.05] bg-card text-card-foreground shadow-[var(--shadow-card)] dark:border-white/[0.08]',
        className,
      )}
    >
      {children}
    </div>
  )
}
