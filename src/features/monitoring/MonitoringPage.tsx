import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Activity as ActivityIcon, AlarmClock, TrendingUp, Users } from 'lucide-react'
import type { Activity, AppUser, Contact, Region } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { computeAttentionLevel, daysSinceTouch } from '@/domain/attention'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { computeManagerRanking } from './managerStats'
import { activitiesPerWeek, portfolioSentiment } from './monitoringStats'
import { CoverageBar, SentimentDonut, WeeklyActivityBars } from './charts'

const MEDALS = ['🥇', '🥈', '🥉']
const WEEKS = 8

export function MonitoringPage() {
  const { user } = useSession()
  const isAdmin = user.role === 'overall_admin'

  const { data, loading, error, retry } = useRepoQuery(
    () =>
      isAdmin
        ? Promise.all([
            repository.listUsers(),
            repository.listContacts(),
            repository.listAllActivities(),
            repository.listRegions(),
          ])
        : Promise.resolve(undefined),
    [isAdmin],
  )
  const users: AppUser[] = useMemo(() => data?.[0] ?? [], [data])
  const contacts: Contact[] = useMemo(() => data?.[1] ?? [], [data])
  const activities: Activity[] = useMemo(() => data?.[2] ?? [], [data])
  const regions: Region[] = data?.[3] ?? []

  const ranking = useMemo(
    () => computeManagerRanking(users, contacts, activities),
    [users, contacts, activities],
  )
  const split = useMemo(() => portfolioSentiment(contacts), [contacts])
  const weekly = useMemo(() => activitiesPerWeek(activities, WEEKS), [activities])
  const engaged = contacts.filter((c) => c.sentiment !== 'neutral').length
  const engagedPct = contacts.length ? Math.round((engaged / contacts.length) * 100) : 0
  const staleCount = useMemo(() => {
    const today = new Date()
    return contacts.filter(
      (c) => computeAttentionLevel(daysSinceTouch(c, activities, today)) !== 'ok',
    ).length
  }, [contacts, activities])
  const recentActivities = weekly.reduce((s, w) => s + w.count, 0)

  const regionName = (id?: string) => regions.find((r) => r.id === id)?.name ?? '—'

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="py-10 text-center text-sm text-muted-foreground">
          Diese Auswertung ist nur für den Overall Admin sichtbar.
        </p>
      </div>
    )
  }
  if (error) return <QueryError error={error} retry={retry} />
  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monitoring</h1>
        <p className="text-sm text-muted-foreground">
          Portfolio-Gesundheit & Performance der Relationship Manager
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Kpi icon={Users} label="Kontakte" value={String(contacts.length)} />
        <Kpi
          icon={TrendingUp}
          label="Betreut"
          value={`${engagedPct}%`}
          hint={`${engaged} von ${contacts.length}`}
          tone={engagedPct >= 75 ? 'good' : engagedPct >= 50 ? 'ok' : 'bad'}
        />
        <Kpi
          icon={ActivityIcon}
          label="Aktivitäten"
          value={String(recentActivities)}
          hint={`letzte ${WEEKS} Wochen`}
        />
        <Kpi
          icon={AlarmClock}
          label="Aufmerksamkeit"
          value={String(staleCount)}
          hint="länger kein Kontakt"
          tone={staleCount === 0 ? 'good' : 'bad'}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aktivität pro Woche</CardTitle>
            <p className="text-xs text-muted-foreground">Alle geloggten Kontaktpunkte</p>
          </CardHeader>
          <CardContent>
            <WeeklyActivityBars weeks={weekly} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Beziehungsstatus</CardTitle>
            <p className="text-xs text-muted-foreground">Portfolio-Gesundheit</p>
          </CardHeader>
          <CardContent>
            <SentimentDonut split={split} />
          </CardContent>
        </Card>
      </div>

      {/* RM coverage comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Betreuungsquote nach Relationship Manager</CardTitle>
          <p className="text-xs text-muted-foreground">
            Anteil der Kontakte mit bewerteter Beziehung
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {ranking.map((s) => (
            <div key={s.user.id} className="flex items-center gap-3">
              <span className="w-44 shrink-0 truncate text-sm">{s.user.name}</span>
              <CoverageBar pct={s.engagedPct} />
              <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums">
                {s.engagedPct}%
              </span>
            </div>
          ))}
          {ranking.length === 0 && (
            <p className="text-sm text-muted-foreground">Keine Relationship Manager vorhanden.</p>
          )}
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <div className="space-y-2">
        <h2 className="px-1 text-sm font-semibold text-muted-foreground">Ranking</h2>
        {ranking.map((s, i) => (
          <Card key={s.user.id}>
            <CardContent className="space-y-3 p-5 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="w-6 shrink-0 text-center text-lg">{MEDALS[i] ?? `#${i + 1}`}</div>
                <Avatar name={s.user.name} className="size-10" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.user.name}</div>
                  <div className="text-xs text-muted-foreground">Region {regionName(s.user.regionId)}</div>
                </div>
                <Link
                  to={`/contacts?filter=unmanaged`}
                  className="hidden text-xs text-primary hover:underline sm:block"
                >
                  Offene Kontakte →
                </Link>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-5">
                  <Metric label="Kontakte" value={s.contactsManaged} />
                  <Metric label="Betreut" value={`${s.engagedPct}%`} />
                  <Metric label="Aktivitäten" value={s.activities} />
                </div>
                <div className="flex h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-secondary">
                  <Seg n={s.bySentiment.green} total={s.contactsManaged} cls="bg-status-green" />
                  <Seg n={s.bySentiment.amber} total={s.contactsManaged} cls="bg-status-amber" />
                  <Seg n={s.bySentiment.red} total={s.contactsManaged} cls="bg-status-red" />
                  <Seg n={s.bySentiment.neutral} total={s.contactsManaged} cls="bg-status-neutral/40" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

const KPI_TONE: Record<'neutral' | 'good' | 'ok' | 'bad', string> = {
  neutral: 'text-foreground',
  good: 'text-status-green',
  ok: 'text-status-amber',
  bad: 'text-status-red',
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  icon: typeof Users
  label: string
  value: string
  hint?: string
  tone?: keyof typeof KPI_TONE
}) {
  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-1 p-4 sm:p-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </span>
        <span className={`text-2xl font-semibold tracking-tight ${KPI_TONE[tone]}`}>{value}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  )
}

function Seg({ n, total, cls }: { n: number; total: number; cls: string }) {
  if (!n || !total) return null
  return <div className={cls} style={{ width: `${(n / total) * 100}%` }} />
}
