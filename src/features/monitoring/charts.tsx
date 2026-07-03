import type { TrafficLight } from '@/domain/types'
import type { WeekBucket } from './monitoringStats'
import { TRAFFIC_LABEL } from '@/components/TrafficLight'

const TRAFFIC_COLOR: Record<TrafficLight, string> = {
  green: 'var(--status-green)',
  amber: 'var(--status-amber)',
  red: 'var(--status-red)',
  neutral: 'var(--status-neutral)',
}

const DONUT_ORDER: TrafficLight[] = ['green', 'amber', 'red', 'neutral']

/** Portfolio-health donut (pure SVG, no chart dependency). */
export function SentimentDonut({ split }: { split: Record<TrafficLight, number> }) {
  const total = DONUT_ORDER.reduce((s, k) => s + split[k], 0)
  const r = 42
  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
      <svg viewBox="0 0 120 120" className="size-36 shrink-0" role="img" aria-label="Beziehungsstatus-Verteilung">
        <g transform="rotate(-90 60 60)">
          {total === 0 ? (
            <circle cx="60" cy="60" r={r} fill="none" stroke="var(--secondary)" strokeWidth="14" />
          ) : (
            DONUT_ORDER.filter((k) => split[k] > 0).map((k) => {
              const frac = split[k] / total
              const seg = (
                <circle
                  key={k}
                  cx="60"
                  cy="60"
                  r={r}
                  fill="none"
                  stroke={TRAFFIC_COLOR[k]}
                  strokeWidth="14"
                  strokeDasharray={`${frac * circumference} ${circumference}`}
                  strokeDashoffset={-offset * circumference}
                >
                  <title>{`${TRAFFIC_LABEL[k]}: ${split[k]}`}</title>
                </circle>
              )
              offset += frac
              return seg
            })
          )}
        </g>
        <text
          x="60"
          y="57"
          textAnchor="middle"
          className="fill-[var(--foreground)] text-[22px] font-semibold"
        >
          {total}
        </text>
        <text x="60" y="74" textAnchor="middle" className="fill-[var(--muted-foreground)] text-[9px]">
          Kontakte
        </text>
      </svg>
      <ul className="grid grid-cols-2 gap-x-5 gap-y-1.5 sm:grid-cols-1">
        {DONUT_ORDER.map((k) => (
          <li key={k} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: TRAFFIC_COLOR[k] }} />
            <span className="text-muted-foreground">{TRAFFIC_LABEL[k]}</span>
            <span className="ml-auto font-medium tabular-nums">{split[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Weekly activity volume as a compact bar chart (pure SVG). */
export function WeeklyActivityBars({ weeks }: { weeks: WeekBucket[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count))
  const H = 110
  const label = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

  return (
    <div>
      <div className="flex h-[110px] items-end gap-1.5">
        {weeks.map((w, i) => {
          const h = Math.max(3, Math.round((w.count / max) * H))
          return (
            <div
              key={i}
              className="group relative flex-1 rounded-t-[4px] bg-primary/15 transition-colors hover:bg-primary/70"
              style={{ height: `${h}px` }}
              title={`KW ab ${label(w.weekStart)}: ${w.count} Aktivität${w.count === 1 ? '' : 'en'}`}
            >
              <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100">
                {w.count}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{label(weeks[0].weekStart)}</span>
        <span>{label(weeks[weeks.length - 1].weekStart)}</span>
      </div>
    </div>
  )
}

/** Horizontal comparison bar (0-100), tone-colored like the reference tool. */
export function CoverageBar({ pct }: { pct: number }) {
  const color =
    pct >= 75 ? 'var(--status-green)' : pct >= 50 ? 'var(--status-amber)' : 'var(--status-red)'
  return (
    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }}
      />
    </div>
  )
}
