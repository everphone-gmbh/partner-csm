import { useEffect, useMemo, useState } from 'react'
import type { Activity, AppUser, Contact, Region } from '@/domain/types'
import { mockRepository } from '@/data/mockRepository'
import { useSession } from '@/app/SessionContext'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { computeManagerRanking } from './managerStats'

const MEDALS = ['🥇', '🥈', '🥉']

export function MonitoringPage() {
  const { user } = useSession()
  const isAdmin = user.role === 'overall_admin'
  const [users, setUsers] = useState<AppUser[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    let active = true
    Promise.all([
      mockRepository.listUsers(),
      mockRepository.listContacts(),
      mockRepository.listAllActivities(),
      mockRepository.listRegions(),
    ]).then(([u, c, a, r]) => {
      if (!active) return
      setUsers(u)
      setContacts(c)
      setActivities(a)
      setRegions(r)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [isAdmin])

  const ranking = useMemo(
    () => computeManagerRanking(users, contacts, activities),
    [users, contacts, activities],
  )
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
  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Monitoring</h1>
        <p className="text-sm text-muted-foreground">Performance der Relationship Manager</p>
      </div>

      <div className="space-y-2">
        {ranking.map((s, i) => (
          <Card key={s.user.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-3">
                <div className="w-6 shrink-0 text-center text-lg">{MEDALS[i] ?? `#${i + 1}`}</div>
                <Avatar name={s.user.name} className="size-10" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.user.name}</div>
                  <div className="text-xs text-muted-foreground">Region {regionName(s.user.regionId)}</div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-4">
                  <Metric label="Kontakte" value={s.contactsManaged} />
                  <Metric label="Betreut" value={`${s.engagedPct}%`} />
                  <Metric label="Aktivitäten" value={s.activities} />
                </div>
                <div className="flex h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-secondary">
                  <Seg n={s.bySentiment.green} total={s.contactsManaged} cls="bg-status-green" />
                  <Seg n={s.bySentiment.amber} total={s.contactsManaged} cls="bg-status-amber" />
                  <Seg n={s.bySentiment.red} total={s.contactsManaged} cls="bg-status-red" />
                  <Seg n={s.bySentiment.neutral} total={s.contactsManaged} cls="bg-status-neutral/40" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {ranking.length === 0 && (
          <p className="text-sm text-muted-foreground">Keine Relationship Manager vorhanden.</p>
        )}
      </div>
    </div>
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
