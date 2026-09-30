import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, List } from 'lucide-react'
import type { Contact, ContactLink } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { useRepoQuery } from '@/app/useRepoQuery'
import { canApprove } from '@/domain/roles'
import { isInRegion } from '@/domain/contactRegions'
import { buildOrgChart, type OrgEdge } from '@/domain/orgChart'
import { QueryError } from '@/components/QueryError'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { OrgQuickEntry } from './OrgQuickEntry'

interface Line {
  id: string
  kind: OrgEdge['kind']
  d: string
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase())
    .slice(0, 2)
    .join('')
}

/**
 * Regionsseite mit Organigramm (Feedback-Runde 2026-09-03, #5 und #8b).
 *
 * Bänder je Ebene, Linien aus „berichtet an", gestrichelt „kennt" und
 * „beeinflusst", weitere Firmen als gestrichelter Hinweis an der Karte. Oben
 * der Schnell-Eintrag: meist wird ein vorhandener Kontakt eingeordnet.
 *
 * Ursprünglich war ein Mockup vorher vereinbart; auf Janniks Anweisung vom
 * 28.09. direkt gebaut — er iteriert im Betrieb.
 */
export function RegionPage() {
  const { id = '' } = useParams()
  const { user } = useSession()
  const q = useRepoQuery(
    () => Promise.all([repository.listRegions(), repository.listContacts(), repository.listAllContactLinks()]),
    [id],
  )
  const [regions, contacts, links] = q.data ?? [[], [], [] as ContactLink[]]
  const region = regions.find((r) => r.id === id)
  const inRegion = useMemo(() => contacts.filter((c) => isInRegion(c, id)), [contacts, id])
  const chart = useMemo(() => buildOrgChart(inRegion, links, contacts), [inRegion, links, contacts])
  const placed = inRegion.filter((c) => c.hierarchyLevel).length

  const contentRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const [lines, setLines] = useState<Line[]>([])

  // Linien aus der tatsächlichen Lage der Karten — die hängt von Breite,
  // Umbruch und Schrift ab und lässt sich nicht vorab ausrechnen.
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    const compute = () => {
      const base = content.getBoundingClientRect()
      const box = (cid: string) => {
        const r = cardRefs.current.get(cid)?.getBoundingClientRect()
        return r && { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }
      }
      const bandOf = new Map<string, number>()
      chart.bands.forEach((band, i) => band.contacts.forEach((c) => bandOf.set(c.id, i)))
      const next: Line[] = []
      let skips = 0
      for (const e of chart.edges) {
        const a = box(e.from)
        const b = box(e.to)
        if (!a || !b) continue
        const gap = Math.abs((bandOf.get(e.from) ?? 0) - (bandOf.get(e.to) ?? 0))
        if (e.kind === 'reports_to' && gap > 1) {
          // Überspringt die Linie eine Ebene, liefe sie senkrecht hinter den
          // Karten dazwischen durch — und sähe aus, als berichte man an die
          // Person in der Mitte. Deshalb seitlich vorbei, als Klammer an den
          // linken Kanten; mehrere solche Linien leicht versetzt.
          const offset = 10 + 7 * (skips++ % 4)
          const left = Math.min(a.x, b.x) - offset
          const y1 = a.y + a.h / 2
          const y2 = b.y + b.h / 2
          next.push({ id: e.id, kind: e.kind, d: `M ${a.x} ${y1} H ${left} V ${y2} H ${b.x}` })
        } else if (e.kind === 'reports_to') {
          // Von oben an der Karte des Unterstellten zur Unterkante der
          // Führungskraft, mit rechtwinkligem Knick — klassisches Organigramm.
          const x1 = a.x + a.w / 2
          const y1 = a.y
          const x2 = b.x + b.w / 2
          const y2 = b.y + b.h
          const mid = y2 + (y1 - y2) / 2
          next.push({ id: e.id, kind: e.kind, d: `M ${x1} ${y1} V ${mid} H ${x2} V ${y2}` })
        } else {
          const x1 = a.x + a.w / 2
          const y1 = a.y + a.h / 2
          const x2 = b.x + b.w / 2
          const y2 = b.y + b.h / 2
          const bend = Math.max(24, Math.abs(x2 - x1) / 4)
          next.push({ id: e.id, kind: e.kind, d: `M ${x1} ${y1} C ${x1} ${y1 - bend}, ${x2} ${y2 - bend}, ${x2} ${y2}` })
        }
      }
      setLines(next)
    }
    compute()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(compute)
    ro.observe(content)
    return () => ro.disconnect()
  }, [chart])

  if (q.error) return <QueryError error={q.error} retry={q.retry} />
  if (!q.data) return <p className="text-sm text-muted-foreground">Lädt…</p>
  if (!region) return <p className="text-sm text-muted-foreground">Diese Region gibt es nicht (mehr).</p>

  return (
    <div className="space-y-4">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Übersicht
      </Link>
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">{region.name}</h1>
          <p className="text-sm text-muted-foreground">
            Organigramm · {inRegion.length} {inRegion.length === 1 ? 'Kontakt' : 'Kontakte'}, davon {placed} eingeordnet
          </p>
        </div>
        <Link to={`/contacts?region=${region.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <List className="size-4" /> Als Liste
        </Link>
      </div>

      {canApprove(user.role) && (
        <OrgQuickEntry regionId={region.id} regionContacts={inRegion} allContacts={contacts} onDone={q.retry} />
      )}

      <Card>
        <CardContent className="pt-5 sm:pt-5">
          {inRegion.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              In dieser Region ist noch niemand. Über „Einordnen“ lässt sich ein vorhandener Kontakt hinzufügen.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div ref={contentRef} className="relative min-w-[720px] space-y-6 py-2 pl-10">
                <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                  {lines.map((l) => (
                    <path
                      key={l.id}
                      d={l.d}
                      fill="none"
                      strokeWidth={1.5}
                      strokeDasharray={l.kind === 'reports_to' ? undefined : '5 4'}
                      className={cn(
                        l.kind === 'reports_to' && 'stroke-muted-foreground/50',
                        l.kind === 'knows' && 'stroke-teal',
                        l.kind === 'influences' && 'stroke-primary',
                      )}
                    />
                  ))}
                </svg>
                {chart.bands.map((band) => (
                  <section key={band.label} aria-label={band.label} className="relative">
                    <h2 className="-ml-10 mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {band.label}
                    </h2>
                    <div className="flex flex-wrap gap-3">
                      {band.contacts.map((c) => (
                        <PersonCard
                          key={c.id}
                          contact={c}
                          externalManagers={chart.externalManagers.get(c.id)}
                          cardRef={(el) => {
                            if (el) cardRefs.current.set(c.id, el)
                            else cardRefs.current.delete(c.id)
                          }}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            <Legend line="solid" label="berichtet an" />
            <Legend line="dashed" className="border-teal" label="kennt" />
            <Legend line="dashed" className="border-primary" label="beeinflusst" />
            <span className="inline-flex items-center gap-1.5">
              <span className="rounded-full border border-dashed border-muted-foreground px-1.5 text-[10px]">auch bei</span>
              arbeitet auch für eine weitere Firma
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PersonCard({
  contact,
  externalManagers,
  cardRef,
}: {
  contact: Contact
  externalManagers?: string[]
  cardRef: (el: HTMLElement | null) => void
}) {
  return (
    <Link
      ref={cardRef}
      to={`/contacts/${contact.id}`}
      className="relative z-10 flex w-44 items-start gap-2 rounded-xl border border-border bg-card px-2.5 py-2 shadow-sm transition-colors hover:border-primary/50"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground">
        {initials(contact.fullName)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{contact.fullName}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{contact.position || '—'}</span>
        {contact.additionalCompanies?.map((co) => (
          <span
            key={co}
            className="mt-1 block truncate rounded-full border border-dashed border-muted-foreground/60 px-1.5 text-[10px] text-muted-foreground"
          >
            auch bei {co}
          </span>
        ))}
        {externalManagers?.map((m) => (
          <span key={m} className="mt-1 block truncate text-[10px] text-muted-foreground">
            ↑ berichtet an {m} (andere Region)
          </span>
        ))}
      </span>
    </Link>
  )
}

function Legend({ line, label, className }: { line: 'solid' | 'dashed'; label: string; className?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          'inline-block w-5 border-t-2',
          line === 'dashed' ? 'border-dashed' : 'border-muted-foreground/50',
          className,
        )}
      />
      {label}
    </span>
  )
}
