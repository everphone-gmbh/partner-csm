import { useNavigate } from 'react-router-dom'
import type { Contact, ContactLink } from '@/domain/types'
import { describeLink } from '@/domain/contactLinks'
import { cn } from '@/lib/utils'

interface GraphNode {
  key: string
  label: string
  sublabel?: string
  kind: 'center' | 'person' | 'region-person' | 'customer-with' | 'customer-without'
  edgeLabel?: string
  onClick?: () => void
}

const NODE_STYLE: Record<GraphNode['kind'], { fill: string; text: string }> = {
  center: { fill: 'var(--primary)', text: 'var(--primary)' },
  person: { fill: '#a93b52', text: '#a93b52' }, // Northdata-inspired person red
  'region-person': { fill: 'var(--status-neutral)', text: 'var(--muted-foreground)' },
  'customer-with': { fill: 'var(--teal)', text: 'var(--teal)' },
  'customer-without': { fill: 'var(--status-neutral)', text: 'var(--muted-foreground)' },
}

/** Simple building glyph (drawn, no icon dependency inside SVG). */
function BuildingGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x - 7}, ${y - 8})`} fill="#fff">
      <rect x="0" y="2" width="14" height="14" rx="1" />
      {[3.5, 8, 12.5].flatMap((cx) =>
        [5, 9, 13].map((cy) => (
          <rect key={`${cx}-${cy}`} x={cx - 1.4} y={cy - 1.2} width="2.8" height="2.4" fill="currentColor" opacity="0.9" />
        )),
      )}
    </g>
  )
}

/** Simple person glyph. */
function PersonGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`} fill="#fff">
      <circle cx="0" cy="-4" r="4" />
      <path d="M -7 9 A 7 7 0 0 1 7 9 Z" />
    </g>
  )
}

/**
 * Northdata-inspired relationship graph: the contact in the center, linked
 * persons and customers around them. Persons navigate to their profile.
 */
export function NetworkGraph({
  contact,
  links,
  contactsById,
  regionColleagues = [],
  regionOverflow = 0,
}: {
  contact: Contact
  links: ContactLink[]
  contactsById: Map<string, Contact>
  /** Kontakte derselben Region ohne explizite Verknüpfung (bereits gekappt). */
  regionColleagues?: Contact[]
  /** Wie viele Regions-Kollegen über die Kappung hinaus existieren. */
  regionOverflow?: number
}) {
  const navigate = useNavigate()

  const nodes: GraphNode[] = []
  for (const link of links) {
    const view = describeLink(link, contact.id)
    if (!view) continue
    const other = contactsById.get(view.otherContactId)
    nodes.push({
      key: `p-${link.id}`,
      label: other?.fullName ?? 'Unbekannt',
      sublabel: other?.company,
      kind: 'person',
      edgeLabel: view.label,
      onClick: other ? () => navigate(`/contacts/${other.id}`) : undefined,
    })
  }
  for (const cust of contact.customers) {
    nodes.push({
      key: `c-${cust.id}`,
      label: cust.name,
      kind: cust.withUs ? 'customer-with' : 'customer-without',
      edgeLabel: cust.withUs ? 'Kunde mit uns' : 'Potenzial',
    })
  }
  for (const colleague of regionColleagues) {
    nodes.push({
      key: `r-${colleague.id}`,
      label: colleague.fullName,
      sublabel: colleague.position || undefined,
      kind: 'region-person',
      onClick: () => navigate(`/contacts/${colleague.id}`),
    })
  }

  if (nodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch keine Verknüpfungen oder Kunden — der Graph wächst mit dem Netzwerk.
      </p>
    )
  }

  const W = 560
  const H = Math.max(280, 200 + nodes.length * 22)
  const cx = W / 2
  const cy = H / 2
  const rx = W / 2 - 90
  const ry = H / 2 - 52

  const positioned = nodes.map((node, i) => {
    // Start at the top, distribute evenly; slight radius wobble reduces overlap.
    const angle = -Math.PI / 2 + (i / nodes.length) * Math.PI * 2
    const wobble = i % 2 === 0 ? 1 : 0.82
    return {
      ...node,
      x: cx + Math.cos(angle) * rx * wobble,
      y: cy + Math.sin(angle) * ry * wobble,
    }
  })

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Netzwerk von ${contact.fullName}`}>
        {/* Edges below nodes */}
        {positioned.map((n) => (
          <g key={`edge-${n.key}`}>
            <line
              x1={cx}
              y1={cy}
              x2={n.x}
              y2={n.y}
              stroke={n.kind === 'person' ? NODE_STYLE.person.fill : 'var(--border)'}
              strokeWidth={n.kind === 'person' ? 2 : 1.5}
              strokeDasharray={n.kind === 'region-person' ? '3 4' : undefined}
            />
            {n.edgeLabel && (
              <text
                x={(cx + n.x) / 2}
                y={(cy + n.y) / 2 - 5}
                textAnchor="middle"
                className="fill-[var(--muted-foreground)] text-[9px]"
              >
                {n.edgeLabel}
              </text>
            )}
          </g>
        ))}

        {/* Outer nodes */}
        {positioned.map((n) => (
          <g
            key={n.key}
            onClick={n.onClick}
            className={cn(n.onClick && 'cursor-pointer')}
            role={n.onClick ? 'link' : undefined}
          >
            <circle cx={n.x} cy={n.y} r={20} fill={NODE_STYLE[n.kind].fill} />
            {n.kind === 'person' || n.kind === 'region-person' ? (
              <PersonGlyph x={n.x} y={n.y} />
            ) : (
              <BuildingGlyph x={n.x} y={n.y} />
            )}
            <text
              x={n.x}
              y={n.y + 34}
              textAnchor="middle"
              style={{ fill: NODE_STYLE[n.kind].text }}
              className="text-[11px] font-semibold"
            >
              {n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}
            </text>
            {n.sublabel && (
              <text
                x={n.x}
                y={n.y + 46}
                textAnchor="middle"
                className="fill-[var(--muted-foreground)] text-[9px]"
              >
                {n.sublabel}
              </text>
            )}
          </g>
        ))}

        {/* Center node on top */}
        <g>
          <circle cx={cx} cy={cy} r={26} fill={NODE_STYLE.center.fill} />
          <PersonGlyph x={cx} y={cy} />
          <text
            x={cx}
            y={cy + 42}
            textAnchor="middle"
            className="fill-[var(--foreground)] text-[12px] font-semibold"
          >
            {contact.fullName}
          </text>
        </g>
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: NODE_STYLE.person.fill }} />
          Verknüpfte Person
        </span>
        {regionColleagues.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: 'var(--status-neutral)' }} />
            Gleiche Region
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: 'var(--teal)' }} />
          Kunde mit uns
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: 'var(--status-neutral)' }} />
          Potenzial
        </span>
      </div>
      {regionOverflow > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          + {regionOverflow} weitere Kontakte in dieser Region (siehe Kontaktliste mit Regions-Filter).
        </p>
      )}
    </div>
  )
}
