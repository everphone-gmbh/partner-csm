import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Target } from 'lucide-react'
import type { Activity, Contact, OrgUnit } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { canViewAnalytics } from '@/domain/roles'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  buildCoverage,
  COVERAGE_HINT,
  COVERAGE_LABEL,
  COVERAGE_VARIANT,
  TOUCH_WINDOW_DAYS,
  type CoverageStatus,
} from '@/domain/coverage'
import { cn } from '@/lib/utils'

const FILTERS: { value: CoverageStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'none', label: 'Kein Kontakt' },
  { value: 'listed', label: 'Nur Namen' },
  { value: 'started', label: 'Angefangen' },
  { value: 'covered', label: 'Abgedeckt' },
]

/**
 * Abdeckungslücken: welche Einheiten eines Partners haben wir wirklich erreicht?
 *
 * Maßstab ist die Soll-Struktur (`org_units`), nicht der eigene Kontaktbestand —
 * nur so fallen Einheiten auf, zu denen niemand erfasst ist. Ergänzt die
 * Regionen-Abdeckung im Dashboard, die die Pflege der BEKANNTEN Kontakte misst.
 */
export function CoveragePage() {
  const { user } = useSession()
  const allowed = canViewAnalytics(user.role)
  const [filter, setFilter] = useState<CoverageStatus | 'all'>('all')

  const { data, loading, error, retry } = useRepoQuery(
    () =>
      allowed
        ? Promise.all([
            repository.listOrgUnits(),
            repository.listContacts(),
            repository.listAllActivities(),
          ])
        : Promise.resolve(undefined),
    [allowed],
  )
  const units: OrgUnit[] = useMemo(() => data?.[0] ?? [], [data])
  const contacts: Contact[] = useMemo(() => data?.[1] ?? [], [data])
  const activities: Activity[] = useMemo(() => data?.[2] ?? [], [data])

  const { rows, summary } = useMemo(
    () => buildCoverage(units, contacts, activities),
    [units, contacts, activities],
  )
  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter)

  if (!allowed) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Die Abdeckung ist nur für den Overall Admin sichtbar.
      </p>
    )
  }
  if (error) return <QueryError error={error} retry={retry} />
  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Target className="size-5 text-muted-foreground" /> Abdeckung
        </h1>
        <p className="text-sm text-muted-foreground">
          Zu welchen Einheiten unserer Partner besteht eine echte Beziehung — und zu welchen nicht?
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Einheiten" value={summary.units} />
        <Kpi
          label="Ohne Kontakt"
          value={summary.unitsWithoutContact}
          tone={summary.unitsWithoutContact > 0 ? 'bad' : 'good'}
        />
        <Kpi
          label="Ohne Betreuer"
          value={summary.unitsWithoutManager}
          tone={summary.unitsWithoutManager > 0 ? 'warn' : 'good'}
        />
        <Kpi
          label="Abgedeckt"
          value={`${summary.units ? Math.round((summary.unitsCovered / summary.units) * 100) : 0}%`}
          hint={`${summary.unitsCovered} von ${summary.units}`}
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              filter === f.value
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Einheiten</CardTitle>
          <p className="text-xs text-muted-foreground">
            „Angesprochen" zählt Kontakte mit einem protokollierten Kontakt in den letzten{' '}
            {TOUCH_WINDOW_DAYS} Tagen.
          </p>
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Einheiten in dieser Auswahl.</p>
          ) : (
            <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
              {visible.map((row) => (
                <li key={row.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium">{row.department}</span>
                      {row.team && (
                        <span className="text-sm text-muted-foreground">{row.team}</span>
                      )}
                      {row.unlisted && (
                        <Badge variant="outline" title="Nicht in der Soll-Struktur hinterlegt">
                          außerhalb
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.company}
                      {row.contacts > 0 && (
                        <>
                          {' · '}
                          {row.contacts} Kontakt{row.contacts === 1 ? '' : 'e'}
                          {' · '}
                          {row.managed} betreut · {row.rated} bewertet · {row.touched} angesprochen
                        </>
                      )}
                    </div>
                  </div>
                  <Badge variant={COVERAGE_VARIANT[row.status]} title={COVERAGE_HINT[row.status]}>
                    {COVERAGE_LABEL[row.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Die Soll-Struktur stammt aus dem Vertriebsstruktur-Sheet. Ändert sie sich bei einem Partner,
        muss sie nachgezogen werden — sonst zeigt die Analyse Lücken, die es nicht mehr gibt.
        Kontakte mit abweichender Team-Angabe erscheinen als „außerhalb" und fließen nicht in die
        Quote ein. <Link to="/contacts" className="text-primary hover:underline">Zu den Kontakten</Link>
      </p>
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'good' | 'warn' | 'bad'
}) {
  return (
    <Card>
      <CardContent className="space-y-0.5 pt-5 sm:pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={cn(
            'text-2xl font-semibold tracking-tight',
            tone === 'bad' && 'text-destructive',
            tone === 'warn' && 'text-status-amber',
            tone === 'good' && 'text-status-green',
          )}
        >
          {value}
        </div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}
