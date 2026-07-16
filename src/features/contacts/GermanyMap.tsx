import type { Contact, Region, TrafficLight } from '@/domain/types'
import { cn } from '@/lib/utils'

// Schematic Germany silhouette (not survey-accurate) with the five working
// regions placed roughly by geography. A real Bundesland map can drop in later.
const SILHOUETTE =
  'M150 18 C176 22 196 14 208 38 C224 58 250 58 244 94 C260 112 249 140 236 150 ' +
  'C250 176 240 210 250 236 C256 272 234 302 214 332 C199 362 174 382 150 374 ' +
  'C121 383 95 360 86 334 C61 320 54 284 66 254 C46 234 51 199 66 184 ' +
  'C51 159 56 120 76 110 C71 80 91 54 116 50 C126 30 136 22 150 18 Z'

// Keyed by the seed/DB region ids so a renamed region keeps its marker;
// display-name fallback covers ad-hoc regions that match a known name.
const POS_BY_ID: Record<string, { x: number; y: number }> = {
  'r-nord': { x: 150, y: 84 },
  'r-ost': { x: 224, y: 196 },
  'r-west': { x: 78, y: 188 },
  'r-mitte': { x: 150, y: 210 },
  'r-sued': { x: 150, y: 312 },
}

const POS_BY_NAME: Record<string, { x: number; y: number }> = {
  Nord: POS_BY_ID['r-nord'],
  Ost: POS_BY_ID['r-ost'],
  West: POS_BY_ID['r-west'],
  Mitte: POS_BY_ID['r-mitte'],
  Süd: POS_BY_ID['r-sued'],
  // Telekom-Vertriebsstruktur: eigene Region Baden-Württemberg/Südwest.
  SüdWest: { x: 104, y: 292 },
}

function regionPos(r: Region): { x: number; y: number } | undefined {
  return POS_BY_ID[r.id] ?? POS_BY_NAME[r.name]
}

const FILL: Record<TrafficLight, string> = {
  green: 'var(--status-green)',
  amber: 'var(--status-amber)',
  red: 'var(--status-red)',
  neutral: 'var(--status-neutral)',
}

export function GermanyMap({
  regions,
  contacts,
  activeRegion,
  onSelectRegion,
  onSelectContact,
}: {
  regions: Region[]
  contacts: Contact[]
  activeRegion: string | null
  onSelectRegion: (regionId: string) => void
  onSelectContact: (contactId: string) => void
}) {
  // Regionen ohne Geografie (Zentral, Unbekannt, …) erscheinen als Chips
  // unter der Karte statt als Marker — sonst wären ihre Kontakte unsichtbar.
  const offMap = regions
    .filter((r) => !regionPos(r))
    .map((r) => ({ region: r, count: contacts.filter((c) => c.regionId === r.id).length }))
    .filter((e) => e.count > 0)

  return (
    <div className="space-y-2">
    <svg viewBox="0 0 300 400" className="mx-auto w-full max-w-sm" role="img" aria-label="Regionen-Karte">
      <path d={SILHOUETTE} className="fill-secondary stroke-border" strokeWidth={1.5} />
      {regions.map((r) => {
        const pos = regionPos(r)
        if (!pos) return null
        const list = contacts.filter((c) => c.regionId === r.id)
        const active = activeRegion === r.id
        return (
          <g key={r.id}>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={26}
              onClick={() => onSelectRegion(r.id)}
              className={cn(
                'cursor-pointer transition-colors',
                active ? 'fill-primary/25 stroke-primary' : 'fill-primary/10 stroke-primary/40',
              )}
              strokeWidth={active ? 2 : 1}
            >
              <title>{`${r.name} — ${list.length} Kontakte`}</title>
            </circle>
            <text
              x={pos.x}
              y={pos.y - 1}
              textAnchor="middle"
              className="pointer-events-none fill-foreground text-[11px] font-semibold"
            >
              {r.name}
            </text>
            <text
              x={pos.x}
              y={pos.y + 11}
              textAnchor="middle"
              className="pointer-events-none fill-muted-foreground text-[9px]"
            >
              {list.length} Kontakte
            </text>
            {list.map((c, i) => {
              const angle = (i / Math.max(list.length, 1)) * Math.PI * 2
              const rad = 32 + (i % 3) * 6
              const px = pos.x + Math.cos(angle) * rad
              const py = pos.y + Math.sin(angle) * rad
              return (
                <circle
                  key={c.id}
                  cx={px}
                  cy={py}
                  r={4}
                  style={{ fill: FILL[c.sentiment] }}
                  className="cursor-pointer stroke-card"
                  strokeWidth={1.25}
                  onClick={() => onSelectContact(c.id)}
                >
                  <title>{`${c.fullName} — ${c.position}`}</title>
                </circle>
              )
            })}
          </g>
        )
      })}
    </svg>
    {offMap.length > 0 && (
      <div className="flex flex-wrap justify-center gap-2">
        {offMap.map(({ region, count }) => (
          <button
            key={region.id}
            type="button"
            onClick={() => onSelectRegion(region.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              activeRegion === region.id
                ? 'border-primary bg-primary/15 text-foreground'
                : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
            )}
          >
            {region.name} · {count} Kontakte
          </button>
        ))}
      </div>
    )}
    </div>
  )
}
