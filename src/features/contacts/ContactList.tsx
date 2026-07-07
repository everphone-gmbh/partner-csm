import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Check, X, HelpCircle, Plus, Upload, Map as MapIcon, List as ListIcon } from 'lucide-react'
import type { Activity, AppUser, Contact, LinkedInStatus, Region } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { canApprove } from '@/domain/roles'
import { useScopedContacts } from '@/app/useScopedContacts'
import { computeAttentionLevel, daysSinceTouch } from '@/domain/attention'
import { Input } from '@/components/ui/input'
import { buttonVariants } from '@/components/ui/button'
import { GermanyMap } from './GermanyMap'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { AttentionBadge } from '@/components/AttentionBadge'
import { TrafficLightDot, TRAFFIC_LABEL } from '@/components/TrafficLight'
import { cn } from '@/lib/utils'

type SortMode = 'name' | 'stale'

const LINKEDIN_MINI: Record<LinkedInStatus, { icon: typeof Check; cls: string; title: string }> = {
  has_account: { icon: Check, cls: 'text-status-green', title: 'LinkedIn vorhanden' },
  no_account: { icon: X, cls: 'text-status-red', title: 'Kein LinkedIn-Account' },
  unknown: { icon: HelpCircle, cls: 'text-muted-foreground', title: 'LinkedIn nicht geprüft' },
}

/** Deep-link filters used by the dashboard stat tiles. */
const SPECIAL_FILTER_LABEL: Record<string, string> = {
  unmanaged: 'Nicht aktiv betreut',
  stale: 'Braucht Aufmerksamkeit',
}

export function ContactList() {
  const { user } = useSession()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const specialFilter = searchParams.get('filter')
  const [q, setQ] = useState('')
  const [regionFilter, setRegionFilter] = useState<string | null>(null)
  const [companyFilter, setCompanyFilter] = useState<string>('')
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
  const [sortMode, setSortMode] = useState<SortMode>(specialFilter === 'stale' ? 'stale' : 'name')

  const { data, loading, error, retry } = useRepoQuery(
    () =>
      Promise.all([
        repository.listContacts(),
        repository.listRegions(),
        repository.listUsers(),
        repository.listAllActivities(),
      ]),
    [],
  )
  const contacts: Contact[] = useMemo(() => data?.[0] ?? [], [data])
  const regions: Region[] = data?.[1] ?? []
  const users: AppUser[] = data?.[2] ?? []
  const activities: Activity[] = useMemo(() => data?.[3] ?? [], [data])

  const today = useMemo(() => new Date(), [])
  const attentionByContact = useMemo(() => {
    const map = new Map<string, { days: number; level: ReturnType<typeof computeAttentionLevel> }>()
    for (const c of contacts) {
      const days = daysSinceTouch(c, activities, today)
      map.set(c.id, { days, level: computeAttentionLevel(days, c.cadenceDays) })
    }
    return map
  }, [contacts, activities, today])

  const regionName = (id: string) => regions.find((r) => r.id === id)?.name ?? '—'
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? '—'

  const { scoped: roleScoped, isAccountManager } = useScopedContacts(contacts)

  /** Unique companies across the visible scope — drives the Firma filter. */
  const companies = useMemo(
    () =>
      [...new Set(roleScoped.map((c) => c.company).filter((x): x is string => Boolean(x)))].sort(
        (a, b) => a.localeCompare(b, 'de'),
      ),
    [roleScoped],
  )

  const visible = useMemo(() => {
    let list = roleScoped
    if (specialFilter === 'unmanaged') list = list.filter((c) => c.sentiment === 'neutral')
    if (specialFilter === 'stale')
      list = list.filter((c) => attentionByContact.get(c.id)?.level !== 'ok')
    if (regionFilter) list = list.filter((c) => c.regionId === regionFilter)
    if (companyFilter) list = list.filter((c) => c.company === companyFilter)
    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter(
        (c) =>
          c.fullName.toLowerCase().includes(term) ||
          c.position.toLowerCase().includes(term) ||
          (c.company ?? '').toLowerCase().includes(term),
      )
    }
    return [...list].sort((a, b) =>
      sortMode === 'stale'
        ? (attentionByContact.get(b.id)?.days ?? 0) - (attentionByContact.get(a.id)?.days ?? 0)
        : a.fullName.localeCompare(b.fullName, 'de'),
    )
  }, [roleScoped, q, regionFilter, companyFilter, sortMode, attentionByContact, specialFilter])

  if (error) return <QueryError error={error} retry={retry} />

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Kontakte</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? 'Lädt…' : `${visible.length} von ${contacts.length} Kontakten`}
            {isAccountManager && user.regionId ? ` · Region ${regionName(user.regionId)}` : ''}
          </p>
        </div>
        {canApprove(user.role) && (
          <div className="flex gap-2">
            <Link to="/contacts/import" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <Upload className="size-4" /> Importieren
            </Link>
            <Link to="/contacts/new" className={buttonVariants({ size: 'sm' })}>
              <Plus className="size-4" /> Neuer Kontakt
            </Link>
          </div>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name oder Funktion suchen…"
          className="pl-9"
        />
      </div>

      {specialFilter && SPECIAL_FILTER_LABEL[specialFilter] && (
        <button
          type="button"
          onClick={() => setSearchParams({})}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
        >
          {SPECIAL_FILTER_LABEL[specialFilter]}
          <X className="size-3" />
        </button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {([
            { mode: 'list', label: 'Liste', icon: ListIcon },
            { mode: 'map', label: 'Karte', icon: MapIcon },
          ] as const).map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs transition-colors',
                viewMode === mode
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
        {viewMode === 'list' && (
          <div className="flex flex-wrap items-center gap-3">
            {companies.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Firma
                <select
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  className="h-7 max-w-40 rounded-[10px] border border-transparent bg-secondary px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Alle</option>
                  {companies.map((co) => (
                    <option key={co} value={co}>
                      {co}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Sortierung
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="h-7 rounded-[10px] border border-transparent bg-secondary px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="name">Name</option>
                <option value="stale">Zuletzt aktiv</option>
              </select>
            </label>
          </div>
        )}
      </div>

      {!isAccountManager && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={regionFilter === null} onClick={() => setRegionFilter(null)}>
            Alle Regionen
          </FilterChip>
          {regions.map((r) => (
            <FilterChip
              key={r.id}
              active={regionFilter === r.id}
              onClick={() => setRegionFilter(r.id)}
            >
              {r.name}
            </FilterChip>
          ))}
        </div>
      )}

      {viewMode === 'map' ? (
        <Card>
          <CardContent className="pt-5 sm:pt-5">
            <GermanyMap
              regions={regions}
              contacts={roleScoped}
              activeRegion={regionFilter}
              onSelectRegion={(id) => {
                setRegionFilter(id)
                setViewMode('list')
              }}
              onSelectContact={(id) => navigate(`/contacts/${id}`)}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Region antippen zum Filtern · Punkt = Kontakt (Farbe = Beziehungsstatus)
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visible.map((c) => {
          const mini = LINKEDIN_MINI[c.linkedin.status]
          const MiniIcon = mini.icon
          const attention = attentionByContact.get(c.id)
          return (
            <Link key={c.id} to={`/contacts/${c.id}`} className="group">
              <Card className="flex items-center gap-3 p-3 transition-colors group-hover:border-primary/40 group-hover:bg-secondary/40">
                <Avatar src={c.photoUrl} name={c.fullName} className="size-11" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{c.fullName}</span>
                    <MiniIcon className={cn('size-3.5 shrink-0', mini.cls)} aria-label={mini.title} />
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {c.position}
                    {c.company ? ` · ${c.company}` : ''}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrafficLightDot value={c.sentiment} />
                    <span>{TRAFFIC_LABEL[c.sentiment]}</span>
                    <span>·</span>
                    <span className="truncate">{regionName(c.regionId)}</span>
                  </div>
                  {attention && attention.level !== 'ok' && (
                    <div className="mt-1">
                      <AttentionBadge level={attention.level} days={attention.days} />
                    </div>
                  )}
                </div>
                <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
                  {userName(c.relationshipManagerId).split(' ')[0]}
                </Badge>
              </Card>
            </Link>
          )
        })}
      </div>

      {!loading && visible.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Keine Kontakte gefunden.</p>
      )}
        </>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        active
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
