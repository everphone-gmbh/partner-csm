import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Search, Check, X, HelpCircle } from 'lucide-react'
import type { AppUser, Contact, LinkedInStatus, Region } from '@/domain/types'
import { mockRepository } from '@/data/mockRepository'
import { useSession } from '@/app/SessionContext'
import { ROLE_RANK } from '@/domain/roles'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { TrafficLightDot, TRAFFIC_LABEL } from '@/components/TrafficLight'
import { cn } from '@/lib/utils'

const LINKEDIN_MINI: Record<LinkedInStatus, { icon: typeof Check; cls: string; title: string }> = {
  has_account: { icon: Check, cls: 'text-status-green', title: 'LinkedIn vorhanden' },
  no_account: { icon: X, cls: 'text-status-red', title: 'Kein LinkedIn-Account' },
  unknown: { icon: HelpCircle, cls: 'text-muted-foreground', title: 'LinkedIn nicht geprüft' },
}

export function ContactList() {
  const { user } = useSession()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [q, setQ] = useState('')
  const [regionFilter, setRegionFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([
      mockRepository.listContacts(),
      mockRepository.listRegions(),
      mockRepository.listUsers(),
    ]).then(([c, r, u]) => {
      if (!active) return
      setContacts(c)
      setRegions(r)
      setUsers(u)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const regionName = (id: string) => regions.find((r) => r.id === id)?.name ?? '—'
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? '—'

  const isAccountManager = ROLE_RANK[user.role] === ROLE_RANK.account_manager

  const visible = useMemo(() => {
    let list = contacts
    // Row-level scope: account managers only see their own region (mirrors RLS).
    if (isAccountManager && user.regionId) {
      list = list.filter((c) => c.regionId === user.regionId)
    }
    if (regionFilter) list = list.filter((c) => c.regionId === regionFilter)
    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter(
        (c) =>
          c.fullName.toLowerCase().includes(term) ||
          c.position.toLowerCase().includes(term),
      )
    }
    return [...list].sort((a, b) => a.fullName.localeCompare(b.fullName, 'de'))
  }, [contacts, q, regionFilter, isAccountManager, user.regionId])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Kontakte</h1>
        <p className="text-sm text-muted-foreground">
          {loading ? 'Lädt…' : `${visible.length} von ${contacts.length} Kontakten`}
          {isAccountManager && user.regionId ? ` · Region ${regionName(user.regionId)}` : ''}
        </p>
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visible.map((c) => {
          const mini = LINKEDIN_MINI[c.linkedin.status]
          const MiniIcon = mini.icon
          return (
            <Link key={c.id} to={`/contacts/${c.id}`} className="group">
              <Card className="flex items-center gap-3 p-3 transition-colors group-hover:border-primary/40 group-hover:bg-secondary/40">
                <Avatar src={c.photoUrl} name={c.fullName} className="size-11" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{c.fullName}</span>
                    <MiniIcon className={cn('size-3.5 shrink-0', mini.cls)} aria-label={mini.title} />
                  </div>
                  <div className="truncate text-sm text-muted-foreground">{c.position}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrafficLightDot value={c.sentiment} />
                    <span>{TRAFFIC_LABEL[c.sentiment]}</span>
                    <span>·</span>
                    <span className="truncate">{regionName(c.regionId)}</span>
                  </div>
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
