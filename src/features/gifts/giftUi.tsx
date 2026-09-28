import type { GiftSender, GiftStatus } from '@/domain/types'
import { GIFT_STATUSES } from '@/domain/types'
import { GIFT_STATUS_LABEL, sortSenders } from '@/domain/gifts'
import { cn } from '@/lib/utils'

/** Farben der Status-Pillen wie im Mockup: grau · bernstein · teal · grün. */
export const GIFT_STATUS_CLASS: Record<GiftStatus, string> = {
  geplant: 'bg-secondary text-muted-foreground',
  bestellt: 'bg-status-amber/15 text-status-amber',
  versandt: 'bg-teal/15 text-teal',
  zugestellt: 'bg-status-green/15 text-status-green',
}

/** Balkenfarben des Trichters, gleiche Reihenfolge. */
export const GIFT_STATUS_BAR: Record<GiftStatus, string> = {
  geplant: 'bg-muted-foreground/60',
  bestellt: 'bg-status-amber',
  versandt: 'bg-teal',
  zugestellt: 'bg-status-green',
}

export function StatusPill({ status }: { status: GiftStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
        GIFT_STATUS_CLASS[status],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {GIFT_STATUS_LABEL[status]}
    </span>
  )
}

/**
 * Status als Auswahl, die wie eine Pille aussieht — Status ist das, was sich
 * in der Liste am häufigsten ändert, er soll ohne Dialog umstellbar sein.
 */
export function StatusSelect({
  value,
  onChange,
  disabled,
  label = 'Status',
}: {
  value: GiftStatus
  onChange: (s: GiftStatus) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as GiftStatus)}
      className={cn(
        'cursor-pointer appearance-none rounded-full border-0 px-2.5 py-0.5 pr-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
        GIFT_STATUS_CLASS[value],
      )}
    >
      {GIFT_STATUSES.map((s) => (
        <option key={s} value={s}>
          {GIFT_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  )
}

/** Absender als Chips; C-Level farbig vorn — so erkennt man die Voreinstellung. */
export function SenderChips({ ids, senders }: { ids: string[]; senders: GiftSender[] }) {
  const chosen = sortSenders(senders.filter((s) => ids.includes(s.id)))
  if (chosen.length === 0) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {chosen.map((s) => (
        <span
          key={s.id}
          className={cn(
            'whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px]',
            s.isCLevel ? 'bg-primary/10 font-semibold text-primary' : 'bg-secondary text-foreground',
          )}
        >
          {s.name}
        </span>
      ))}
    </div>
  )
}
