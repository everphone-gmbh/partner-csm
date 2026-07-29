import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity as ActivityIcon, AlarmClock, TrendingUp, Users } from 'lucide-react'
import type { Activity, AppUser, AuditEntry, Contact, Region } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { computeAttentionLevel, daysSinceTouch } from '@/domain/attention'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime } from '@/lib/format'
import { Avatar } from '@/components/ui/avatar'
import { completenessScore, findDuplicateContacts } from '@/domain/dataQuality'
import { Badge } from '@/components/ui/badge'
import { computeManagerRanking } from './managerStats'
import { activitiesPerWeek, portfolioSentiment } from './monitoringStats'
import { CoverageBar, SentimentDonut, WeeklyActivityBars } from './charts'

const MEDALS = ['🥇', '🥈', '🥉']
const WEEKS = 8

const AUDIT_LABEL: Record<AuditEntry['action'], string> = {
  insert: 'Angelegt',
  update: 'Geändert',
  delete: 'Gelöscht',
}

const AUDIT_VARIANT: Record<AuditEntry['action'], 'success' | 'secondary' | 'destructive'> = {
  insert: 'success',
  update: 'secondary',
  delete: 'destructive',
}

const AUDIT_ENTITY_LABEL: Record<string, string> = {
  contact: 'Kontakt',
  contact_photo: 'Foto',
  side_fact: 'Anknüpfungspunkt',
}

export function MonitoringPage() {
  const { user } = useSession()
  const { toast } = useToast()
  const isAdmin = user.role === 'overall_admin'
  const [reassigning, setReassigning] = useState(false)

  const { data, loading, error, retry } = useRepoQuery(
    () =>
      isAdmin
        ? Promise.all([
            repository.listUsers(),
            repository.listContacts(),
            repository.listAllActivities(),
            repository.listRegions(),
            repository.listAuditLog(40),
          ])
        : Promise.resolve(undefined),
    [isAdmin],
  )
  const users: AppUser[] = useMemo(() => data?.[0] ?? [], [data])
  const contacts: Contact[] = useMemo(() => data?.[1] ?? [], [data])
  const activities: Activity[] = useMemo(() => data?.[2] ?? [], [data])
  const regions: Region[] = data?.[3] ?? []
  const auditLog: AuditEntry[] = useMemo(() => data?.[4] ?? [], [data])

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
      (c) => computeAttentionLevel(daysSinceTouch(c, activities, today), c.cadenceDays) !== 'ok',
    ).length
  }, [contacts, activities])
  const recentActivities = weekly.reduce((s, w) => s + w.count, 0)
  const duplicates = useMemo(() => findDuplicateContacts(contacts), [contacts])
  const incomplete = useMemo(
    () =>
      contacts
        .map((c) => ({ contact: c, score: completenessScore(c) }))
        .filter(({ score }) => score.pct < 100)
        .sort((a, b) => a.score.pct - b.score.pct)
        .slice(0, 5),
    [contacts],
  )

  const regionName = (id?: string) => regions.find((r) => r.id === id)?.name ?? '—'

  // Handover ("Accounter fällt raus"): move an entire book to a colleague.
  const reassign = async (fromUser: AppUser, toUserId: string) => {
    const toUser = users.find((u) => u.id === toUserId)
    if (!toUser) return
    const sure = window.confirm(
      `Alle Kontakte von ${fromUser.name} an ${toUser.name} übergeben?`,
    )
    if (!sure) return
    setReassigning(true)
    try {
      const moved = await repository.reassignContacts(fromUser.id, toUserId)
      toast(`${moved} Kontakt${moved === 1 ? '' : 'e'} an ${toUser.name} übergeben.`, 'success')
      retry()
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setReassigning(false)
    }
  }

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

      {/* Änderungsprotokoll — DSGVO-Nachweispflicht */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Änderungsprotokoll</CardTitle>
          <p className="text-xs text-muted-foreground">
            Wer hat wann welche personenbezogenen Daten geändert. Protokolliert werden
            Feldnamen, bewusst keine Werte — sonst lägen die Daten doppelt.
          </p>
        </CardHeader>
        <CardContent>
          {auditLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Änderungen protokolliert.
            </p>
          ) : (
            <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
              {auditLog.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2 text-sm">
                  <Badge variant={AUDIT_VARIANT[entry.action]} className="shrink-0">
                    {AUDIT_LABEL[entry.action]}
                  </Badge>
                  <span className="text-muted-foreground">{AUDIT_ENTITY_LABEL[entry.entity] ?? entry.entity}</span>
                  {entry.entityId && entry.entity === 'contact' && entry.action !== 'delete' && (
                    <Link to={`/contacts/${entry.entityId}`} className="hover:underline">
                      öffnen
                    </Link>
                  )}
                  {entry.fields && entry.fields.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Felder: {entry.fields.join(', ')}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {entry.actorName ?? 'System/Import'} · {formatDateTime(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Data quality */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datenqualität</CardTitle>
          <p className="text-xs text-muted-foreground">
            Mögliche Duplikate und unvollständige Profile
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Mögliche Duplikate ({duplicates.length})
            </h3>
            {duplicates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Duplikate erkannt. ✨</p>
            ) : (
              <ul className="space-y-1.5">
                {duplicates.map(({ a, b, reason }) => (
                  <li
                    key={`${a.id}-${b.id}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-status-amber/40 bg-status-amber/5 px-3 py-2 text-sm"
                  >
                    <Link to={`/contacts/${a.id}`} className="font-medium hover:underline">
                      {a.fullName}
                    </Link>
                    <span className="text-muted-foreground">↔</span>
                    <Link to={`/contacts/${b.id}`} className="font-medium hover:underline">
                      {b.fullName}
                    </Link>
                    <Badge variant="warning" className="ml-auto">
                      {reason}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Unvollständigste Profile
            </h3>
            {incomplete.length === 0 ? (
              <p className="text-sm text-muted-foreground">Alle Profile vollständig. 💯</p>
            ) : (
              <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {incomplete.map(({ contact, score }) => (
                  <li key={contact.id} className="flex items-center gap-3 py-1.5">
                    <Link
                      to={`/contacts/${contact.id}`}
                      className="w-40 shrink-0 truncate text-sm font-medium hover:underline"
                    >
                      {contact.fullName}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      fehlt: {score.missing.join(', ')}
                    </span>
                    <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums">
                      {score.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
                <select
                  className="h-8 rounded-[10px] border border-transparent bg-secondary px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value=""
                  disabled={reassigning || s.contactsManaged === 0}
                  onChange={(e) => {
                    if (e.target.value) void reassign(s.user, e.target.value)
                    e.target.value = ''
                  }}
                  title="Alle Kontakte dieses Managers an ein anderes Teammitglied übergeben"
                >
                  <option value="">Übergeben an…</option>
                  {users
                    .filter((u) => u.id !== s.user.id && u.role !== 'account_manager')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
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
