import { Check, CircleDashed, X } from 'lucide-react'
import type { AttendanceStatus } from '@/domain/types'
import { cn } from '@/lib/utils'

/**
 * During-the-event convenience (Event-Pulse-inspired): one tap cycles
 * Zugesagt → Getroffen → Nicht erschienen → Zugesagt. Big touch target,
 * readable at a glance on the phone at the booth.
 */
export function MetPill({
  status,
  onChange,
  disabled,
}: {
  status: AttendanceStatus
  onChange: (next: AttendanceStatus) => void
  disabled?: boolean
}) {
  const next: AttendanceStatus =
    status === 'attended' ? 'no_show' : status === 'no_show' ? 'accepted' : 'attended'

  const view =
    status === 'attended'
      ? { label: 'Getroffen', icon: Check, cls: 'bg-status-green/15 text-status-green' }
      : status === 'no_show'
        ? { label: 'Nicht erschienen', icon: X, cls: 'bg-status-red/15 text-status-red' }
        : { label: 'Getroffen?', icon: CircleDashed, cls: 'bg-secondary text-muted-foreground' }

  const Icon = view.icon
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(next)}
      title="Tippen zum Wechseln: Getroffen? → Getroffen → Nicht erschienen"
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors active:scale-95 disabled:opacity-50',
        view.cls,
      )}
    >
      <Icon className="size-4" />
      {view.label}
    </button>
  )
}
