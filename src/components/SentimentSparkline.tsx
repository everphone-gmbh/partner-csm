import type { SentimentEntry, TrafficLight } from '@/domain/types'
import { formatDate } from '@/lib/format'

const SCORE: Record<TrafficLight, number> = { green: 3, amber: 2, red: 1, neutral: 0 }
const COLOR: Record<TrafficLight, string> = {
  green: 'var(--status-green)',
  amber: 'var(--status-amber)',
  red: 'var(--status-red)',
  neutral: 'var(--status-neutral)',
}

const MAX_POINTS = 12
const W = 120
const H = 28
const PAD = 4

/**
 * Mini trend chart of the relationship (traffic-light) history: a quiet line
 * with per-rating colored dots — shows at a glance whether the relationship
 * is trending up or down.
 */
export function SentimentSparkline({ entries }: { entries: SentimentEntry[] }) {
  const recent = entries.slice(-MAX_POINTS)
  if (recent.length < 2) return null

  const step = (W - 2 * PAD) / (recent.length - 1)
  const y = (v: TrafficLight) => PAD + (1 - SCORE[v] / 3) * (H - 2 * PAD)
  const points = recent.map((e, i) => ({ x: PAD + i * step, y: y(e.value), entry: e }))

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-7 w-[120px]"
      role="img"
      aria-label={`Beziehungsverlauf, ${recent.length} Bewertungen`}
    >
      <polyline
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
      />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 3.5 : 2.5} fill={COLOR[p.entry.value]}>
          <title>{`${formatDate(p.entry.at)}${p.entry.byName ? ` · ${p.entry.byName}` : ''}`}</title>
        </circle>
      ))}
    </svg>
  )
}
