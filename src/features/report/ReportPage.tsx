import { useMemo, useState } from 'react'
import { AlarmClock, Cake, Printer } from 'lucide-react'
import type { Activity, AppUser, Contact, Region } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { canViewAnalytics } from '@/domain/roles'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SentimentDonut } from '@/features/monitoring/charts'
import { formatDate } from '@/lib/format'
import { buildRegionReport } from './reportData'
import { selectCls } from '@/features/contacts/profile/shared'

/**
 * Druckfertiger QBR-/Regionen-Bericht: dieselben Zahlen wie Dashboard und
 * Monitoring, als One-Pager für Management-Reviews. Drucken/PDF via
 * window.print() — Navigation und Steuerelemente sind print:hidden.
 */
export function ReportPage() {
  const { user } = useSession()
  const allowed = canViewAnalytics(user.role)
  const [regionId, setRegionId] = useState<string>(user.regionId ?? '')
  const [managerId, setManagerId] = useState<string>('')

  const { data, loading, error, retry } = useRepoQuery(
    () =>
      allowed
        ? Promise.all([
            repository.listContacts(),
            repository.listAllActivities(),
            repository.listRegions(),
            repository.listUsers(),
          ])
        : Promise.resolve(undefined),
    [allowed],
  )
  const contacts: Contact[] = useMemo(() => data?.[0] ?? [], [data])
  const activities: Activity[] = useMemo(() => data?.[1] ?? [], [data])
  const regions: Region[] = data?.[2] ?? []
  const users: AppUser[] = data?.[3] ?? []

  const report = useMemo(
    () => buildRegionReport(contacts, activities, regionId || null, managerId || null),
    [contacts, activities, regionId, managerId],
  )
  const regionName = regionId ? regions.find((r) => r.id === regionId)?.name ?? '—' : 'Alle Regionen'
  const managerName = managerId ? users.find((u) => u.id === managerId)?.name ?? '—' : 'Alle Nutzer'

  if (!allowed) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Berichte sind nur für den Overall Admin sichtbar.
      </p>
    )
  }
  if (error) return <QueryError error={error} retry={retry} />
  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bericht</h1>
          <p className="text-sm text-muted-foreground">QBR-One-Pager für Management-Reviews</p>
        </div>
        <div className="flex items-center gap-2">
          <select className={selectCls} value={regionId} onChange={(e) => setRegionId(e.target.value)}>
            <option value="">Alle Regionen</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            aria-label="Nach Nutzer filtern"
          >
            <option value="">Alle Nutzer</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Drucken / PDF
          </Button>
        </div>
      </div>

      {/* Report header (print + screen) */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-semibold tracking-tight">Partner CSM — Beziehungsbericht</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{regionName}</span>
        {' · '}
        <span className="font-medium text-foreground">{managerName}</span> · Stand{' '}
        {formatDate(new Date().toISOString())} · vertraulich, nur zur internen Verwendung
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ReportKpi label="Kontakte" value={String(report.total)} />
        <ReportKpi label="Aktiv betreut" value={`${report.engagedPct}%`} hint={`${report.engaged} von ${report.total}`} />
        <ReportKpi label="Aktivitäten (30 T.)" value={String(report.recentActivities)} />
        <ReportKpi label="Braucht Aufmerksamkeit" value={String(report.stale.length)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Beziehungsstatus</CardTitle>
        </CardHeader>
        <CardContent>
          <SentimentDonut split={report.bySentiment} />
        </CardContent>
      </Card>

      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlarmClock className="size-4 text-muted-foreground" /> Braucht Aufmerksamkeit
          </CardTitle>
        </CardHeader>
        <CardContent>
          {report.stale.length === 0 ? (
            <p className="text-sm text-muted-foreground">Alle Kontakte im Rhythmus. 👏</p>
          ) : (
            <ul className="divide-y divide-black/[0.04]">
              {report.stale.map(({ contact, days }) => (
                <li key={contact.id} className="flex items-center justify-between gap-3 py-1.5">
                  <div className="min-w-0">
                    <span className="text-sm font-medium">{contact.fullName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{contact.position}</span>
                  </div>
                  <Badge variant={days >= 90 ? 'destructive' : 'warning'}>{days} T.</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="print:break-inside-avoid">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cake className="size-4 text-muted-foreground" /> Geburtstage (30 Tage)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {report.birthdays.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine anstehenden Geburtstage.</p>
          ) : (
            <ul className="divide-y divide-black/[0.04]">
              {report.birthdays.map(({ contact, inDays }) => (
                <li key={contact.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-sm font-medium">{contact.fullName}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(contact.birthday)} · {inDays === 0 ? 'heute' : `in ${inDays} T.`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ReportKpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="print:break-inside-avoid">
      <CardContent className="flex flex-col gap-0.5 p-4 sm:p-4">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  )
}
