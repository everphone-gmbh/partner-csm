import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NoticeTone = 'error' | 'warning' | 'info' | 'success'

const TONE: Record<NoticeTone, { box: string; Icon: typeof Info }> = {
  error: { box: 'border-danger-line bg-danger-soft text-danger-ink', Icon: CircleX },
  warning: { box: 'border-warning-line bg-warning-soft text-warning-ink', Icon: TriangleAlert },
  info: { box: 'border-neutral-line bg-neutral-soft text-neutral-ink', Icon: Info },
  success: { box: 'border-success-line bg-success-soft text-success-ink', Icon: CircleCheck },
}

/**
 * Hinweisbox für Fehler, Warnungen und Erklärungen — eine Form für alle Seiten
 * (bis 09/26 baute jede Seite ihre eigene, mit roter Schrift auf Rosa, die kaum
 * lesbar war). Fehler werden vorgelesen; der Text sagt, was passiert ist und was
 * zu tun ist.
 */
export function Notice({
  tone = 'info',
  children,
  action,
  className,
}: {
  tone?: NoticeTone
  children: ReactNode
  /** Knopf oder Link rechts, z. B. „Erneut versuchen". */
  action?: ReactNode
  className?: string
}) {
  const { box, Icon } = TONE[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn('flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[13px] leading-[18px]', box, className)}
    >
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}

/**
 * Kurzer Hinweis direkt am Knopf oder Feld, wenn etwas fehlt. Ersetzt den
 * gesperrten Knopf: der bleibt klickbar und sagt beim Klick, was noch fehlt —
 * ein grauer Knopf verrät das nicht, und sein Tooltip erscheint auf dem Handy nie.
 */
export function FieldHint({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <p
      id={id}
      role="alert"
      className={cn('flex items-center gap-1.5 text-[13px] leading-[18px] text-danger-ink', className)}
    >
      <CircleAlert className="size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  )
}
