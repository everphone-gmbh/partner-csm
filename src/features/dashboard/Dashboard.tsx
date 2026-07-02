import { useMemo, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, Bell, Cake, TrendingUp, Users } from 'lucide-react'
import type { Activity, Contact, Region, Reminder } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { canViewSensitiveFields } from '@/domain/roles'
import { useScopedContacts } from '@/app/useScopedContacts'
import { computeAttentionLevel, daysSinceTouch } from '@/domain/attention'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { TrafficLightDot } from '@/components/TrafficLight'
import { formatDate, daysUntil } from '@/lib/format'
import { computeRegionCoverage, overallSummary, upcomingBirthdays } from './dashboardStats'

export function Dashboard() {
  const { user } = useSession()

  const { data, loading, error, retry } = useRepoQuery(
    () =>
      Promise.all([
        repository.listContacts(),
        repository.listRegions(),
        repository.listReminders(),
        repository.listAllActivities(),
      ]),
    [],
  )
  const contacts: Contact[] = useMemo(() => data?.[0] ?? [], [data])
  const regions: Region[] = data?.[1] ?? []
  const reminders: Reminder[] = useMemo(() => data?.[2] ?? [], [data])
  const activities: Activity[] = useMemo(() => data?.[3] ?? [], [data])

  const { scoped } = useScopedContacts(contacts)
  const needsAttention = useMemo(() => {
    const today = new Date()
    return scoped
      .map((c) => ({ contact: c, days: daysSinceTouch(c, activities, today) }))
      .filter(({ days }) => computeAttentionLevel(days) !== 'ok')
      .sort((a, b) => b.days - a.days)
      .slice(0, 8)
  }, [scoped, activities])
  const regionName = (id: string) => regions.find((r) => r.id === id)?.name ?? id
  const coverage = useMemo(() => computeRegionCoverage(scoped), [scoped])
  const summary = useMemo(() => overallSummary(scoped), [scoped])
  const canSensitive = canViewSensitiveFields(user.role)
  const birthdays = useMemo(
    () => (canSensitive ? upcomingBirthdays(scoped, 30, new Date()) : []),
    [scoped, canSensitive],
  )
  const scopedIds = useMemo(() => new Set(scoped.map((c) => c.id)), [scoped])
  const openReminders = useMemo(
    () =>
      reminders
        .filter((r) => !r.done && scopedIds.has(r.contactId))
        .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)),
    [reminders, scopedIds],
  )
  const contactName = (cid: string) => contacts.find((c) => c.id === cid)?.fullName ?? cid

  if (error) return <QueryError error={error} retry={retry} />
  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Übersicht</h1>
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

      {needsAttention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Braucht Aufmerksamkeit</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
              {needsAttention.map(({ contact, days }) => (
                <li key={contact.id}>
                  <Link
                    to={`/contacts/${contact.id}`}
                    className="flex items-center gap-3 rounded-lg px-1.5 py-2 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                  >
                    <Avatar src={contact.photoUrl} name={contact.fullName} className="size-9" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{contact.fullName}</div>
                      <div className="text-xs text-muted-foreground">
                        Seit {days} Tagen kein Kontakt
                      </div>
                    </div>
                    <Badge variant={days >= 90 ? 'destructive' : 'warning'}>
                      <AlarmClock className="size-3" />
                      {days} T.
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {openReminders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Offene Reminder</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
              {openReminders.map((r) => {
                const d = daysUntil(r.dueDate)
                const overdue = d !== null && d < 0
                return (
                  <li key={r.id}>
                    <Link
                      to={`/contacts/${r.contactId}`}
                      className="flex items-center gap-3 rounded-lg px-1.5 py-2 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                    >
                      <Bell className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{r.text}</div>
                        <div className="text-xs text-muted-foreground">
                          {contactName(r.contactId)} · {formatDate(r.dueDate)}
                        </div>
                      </div>
                      {d !== null && (
                        <Badge variant={overdue ? 'destructive' : d <= 3 ? 'warning' : 'secondary'}>
                          {overdue ? 'überfällig' : d === 0 ? 'heute' : `in ${d} T.`}
                        </Badge>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

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
              <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {birthdays.map(({ contact, inDays }) => (
                  <li key={contact.id}>
                    <Link
                      to={`/contacts/${contact.id}`}
                      className="flex items-center gap-3 rounded-lg px-1.5 py-2 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
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
      <CardContent className="flex flex-col gap-1.5 p-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </span>
        <span className="text-3xl font-semibold tracking-tight">{value}</span>
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
