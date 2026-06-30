import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { Cake, TrendingUp, Users } from 'lucide-react'
import type { Contact, Region } from '@/domain/types'
import { mockRepository } from '@/data/mockRepository'
import { useSession } from '@/app/SessionContext'
import { canViewSensitiveFields, ROLE_RANK } from '@/domain/roles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { TrafficLightDot } from '@/components/TrafficLight'
import { formatDate } from '@/lib/format'
import { computeRegionCoverage, overallSummary, upcomingBirthdays } from './dashboardStats'

export function Dashboard() {
  const { user } = useSession()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([mockRepository.listContacts(), mockRepository.listRegions()]).then(([c, r]) => {
      if (!active) return
      setContacts(c)
      setRegions(r)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const isAM = ROLE_RANK[user.role] === ROLE_RANK.account_manager
  const scoped = useMemo(
    () => (isAM && user.regionId ? contacts.filter((c) => c.regionId === user.regionId) : contacts),
    [contacts, isAM, user.regionId],
  )
  const regionName = (id: string) => regions.find((r) => r.id === id)?.name ?? id
  const coverage = useMemo(() => computeRegionCoverage(scoped), [scoped])
  const summary = useMemo(() => overallSummary(scoped), [scoped])
  const canSensitive = canViewSensitiveFields(user.role)
  const birthdays = useMemo(
    () => (canSensitive ? upcomingBirthdays(scoped, 30, new Date()) : []),
    [scoped, canSensitive],
  )

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Übersicht</h1>
        <p className="text-sm text-muted-foreground">Beziehungsstatus auf einen Blick</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard icon={Users} label="Kontakte" value={String(summary.total)} />
        <StatCard
          icon={TrendingUp}
          label="Aktiv betreut"
          value={`${summary.engagedPct}%`}
          hint={`${summary.engaged} von ${summary.total}`}
        />
        {canSensitive && (
          <StatCard icon={Cake} label="Geburtstage (30 T.)" value={String(birthdays.length)} />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regionen-Abdeckung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {coverage.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Daten.</p>
          ) : (
            coverage.map((r) => (
              <div key={r.regionId} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{regionName(r.regionId)}</span>
                  <span className="text-muted-foreground">
                    {r.rated}/{r.total} betreut · {r.coveragePct}%
                  </span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
                  <Seg n={r.bySentiment.green} total={r.total} cls="bg-status-green" />
                  <Seg n={r.bySentiment.amber} total={r.total} cls="bg-status-amber" />
                  <Seg n={r.bySentiment.red} total={r.total} cls="bg-status-red" />
                  <Seg n={r.bySentiment.neutral} total={r.total} cls="bg-status-neutral/40" />
                </div>
              </div>
            ))
          )}
          <Legend />
        </CardContent>
      </Card>

      {canSensitive && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anstehende Geburtstage</CardTitle>
          </CardHeader>
          <CardContent>
            {birthdays.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine in den nächsten 30 Tagen.</p>
            ) : (
              <ul className="space-y-1">
                {birthdays.map(({ contact, inDays }) => (
                  <li key={contact.id}>
                    <Link
                      to={`/contacts/${contact.id}`}
                      className="flex items-center gap-3 rounded-md p-1.5 hover:bg-secondary/50"
                    >
                      <Avatar src={contact.photoUrl} name={contact.fullName} className="size-9" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{contact.fullName}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(contact.birthday)}</div>
                      </div>
                      <Badge variant={inDays === 0 ? 'warning' : 'secondary'}>
                        {inDays === 0 ? 'heute' : `in ${inDays} T.`}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </span>
        <span className="text-xl font-semibold">{value}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  )
}

function Seg({ n, total, cls }: { n: number; total: number; cls: string }) {
  if (!n) return null
  return <div className={cls} style={{ width: `${(n / total) * 100}%` }} />
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <TrafficLightDot value="green" />Positiv
      </span>
      <span className="inline-flex items-center gap-1">
        <TrafficLightDot value="amber" />Im Aufbau
      </span>
      <span className="inline-flex items-center gap-1">
        <TrafficLightDot value="red" />Kritisch
      </span>
      <span className="inline-flex items-center gap-1">
        <TrafficLightDot value="neutral" />Neutral
      </span>
    </div>
  )
}
