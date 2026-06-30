import { cn } from '@/lib/utils'
import type { TrafficLight } from '@/domain/types'

const DOT: Record<TrafficLight, string> = {
  green: 'bg-status-green',
  amber: 'bg-status-amber',
  red: 'bg-status-red',
  neutral: 'bg-status-neutral',
}

export const TRAFFIC_LABEL: Record<TrafficLight, string> = {
  green: 'Positiv',
  amber: 'Im Aufbau',
  red: 'Kritisch',
  neutral: 'Neutral',
}

export function TrafficLightDot({
  value,
  className,
}: {
  value: TrafficLight
  className?: string
}) {
  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-full', DOT[value], className)}
      aria-hidden
    />
  )
}

export function TrafficLightBadge({ value }: { value: TrafficLight }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
      <TrafficLightDot value={value} />
      {TRAFFIC_LABEL[value]}
    </span>
  )
}

/** Clickable rating control for the relationship traffic-light (RMs and above). */
export function TrafficLightPicker({
  value,
  onChange,
}: {
  value: TrafficLight
  onChange: (v: TrafficLight) => void
}) {
  const options: TrafficLight[] = ['green', 'amber', 'red', 'neutral']
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border p-1">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
          title={TRAFFIC_LABEL[opt]}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
            value === opt ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary/60',
          )}
        >
          <TrafficLightDot value={opt} />
          {TRAFFIC_LABEL[opt]}
        </button>
      ))}
    </div>
  )
}
