import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, GitMerge } from 'lucide-react'
import type { Contact } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { useRepoQuery } from '@/app/useRepoQuery'
import { canMergeContacts } from '@/domain/roles'
import { mergePatch, mergeRows, type MergeChoice, type MergeField, type MergeRow } from '@/domain/contactMerge'
import { contactRegionIds } from '@/domain/contactRegions'
import { TRAFFIC_LABEL } from '@/components/TrafficLight'
import { QueryError } from '@/components/QueryError'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { Notice } from '@/components/ui/notice'
import { useConfirm } from '@/components/ui/useConfirm'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Zwei Dubletten zusammenführen (nur Leitung). Links und rechts die beiden
 * Kontakte; man wählt, welcher bleibt, und bei jedem Feld, in dem beide etwas
 * Verschiedenes stehen haben, welcher Wert gilt. Was nur einer hat, wird
 * übernommen. Aktivitäten, Reminder, Fotos, Anknüpfungspunkte, Kunden, Gebiete,
 * Verknüpfungen, Event-Teilnahmen, Favoriten und Geschenke ziehen um bzw.
 * werden vereint — in einer Transaktion (Migration 0038).
 */
export function MergePage() {
  const { user } = useSession()
  const { toast } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const aId = params.get('a') ?? ''
  const bId = params.get('b') ?? ''
  const allowed = canMergeContacts(user.role)

  const q = useRepoQuery(
    () =>
      allowed && aId && bId
        ? Promise.all([
            repository.getContact(aId),
            repository.getContact(bId),
            repository.listUsers(),
            repository.listRegions(),
            // Was an JEDEM der beiden hängt — gezählt wird für den, der gelöscht wird.
            Promise.all([
              repository.listActivities(aId),
              repository.listReminders(aId),
              repository.listContactLinks(aId),
              repository.listContactGifts(aId),
            ]),
            Promise.all([
              repository.listActivities(bId),
              repository.listReminders(bId),
              repository.listContactLinks(bId),
              repository.listContactGifts(bId),
            ]),
          ])
        : Promise.resolve(undefined),
    [allowed, aId, bId],
  )

  const [a, b] = [q.data?.[0], q.data?.[1]]
  // Voreinstellung: der ältere Kontakt bleibt — meist das Original.
  const [winnerSide, setWinnerSide] = useState<'a' | 'b' | null>(null)
  const side = winnerSide ?? (a && b && Date.parse(b.createdAt) < Date.parse(a.createdAt) ? 'b' : 'a')
  const winner = side === 'a' ? a : b
  const loser = side === 'a' ? b : a
  const [choices, setChoices] = useState<Partial<Record<MergeField, MergeChoice>>>({})
  const [running, setRunning] = useState(false)

  const rows = useMemo(() => (winner && loser ? mergeRows(winner, loser) : []), [winner, loser])

  if (!allowed) {
    return (
      <Notice tone="info">Dubletten zusammenführen darf nur die Leitung.</Notice>
    )
  }
  if (q.error) return <QueryError error={q.error} retry={q.retry} />
  if (!q.data) return <p className="text-sm text-muted-foreground">Lädt…</p>
  if (!a || !b || !winner || !loser) {
    return <p className="text-sm text-muted-foreground">Einer der beiden Kontakte existiert nicht mehr.</p>
  }

  const [, , users, regions, relatedA, relatedB] = q.data
  // Zählungen immer für den Verlierer — das ist, was umzieht.
  const [loserActivities, loserReminders, loserLinks, loserGifts] = side === 'a' ? relatedB : relatedA

  const show = (key: MergeField, v: unknown): string => {
    if (v === undefined || v === null || v === '') return '—'
    if (key === 'relationshipManagerId') return users.find((u) => u.id === v)?.name ?? '—'
    if (key === 'sentiment') return TRAFFIC_LABEL[v as Contact['sentiment']]
    if (key === 'birthday') return formatDate(String(v))
    if (key === 'photoUrl') return 'Foto vorhanden'
    if (key === 'cadenceDays') return `alle ${v} Tage`
    return String(v)
  }

  const regionNames = (c: Contact) =>
    contactRegionIds(c)
      .map((id) => regions.find((r) => r.id === id)?.name)
      .filter(Boolean)
      .join(' · ')

  const run = async () => {
    const sure = await confirm({
      title: `„${loser.fullName}“ in „${winner.fullName}“ zusammenführen?`,
      message: `Aktivitäten, Reminder, Verknüpfungen und Geschenke ziehen um, „${loser.fullName}“ wird danach gelöscht. Das lässt sich nicht rückgängig machen.`,
      confirmLabel: 'Zusammenführen',
      tone: 'danger',
    })
    if (!sure) return
    setRunning(true)
    try {
      const merged = await repository.mergeContacts(winner.id, loser.id, mergePatch(rows, choices))
      toast(`Zusammengeführt: ${merged.fullName}.`, 'success')
      navigate(`/contacts/${merged.id}`, { replace: true })
    } catch (err) {
      toast(saveErrorMessage(err))
      setRunning(false)
    }
  }

  // Eine Verbindung zwischen den beiden zieht nicht um, sie entfällt — nicht mitzählen.
  const movingLinks = loserLinks.filter(
    (l) => !(l.fromContactId === winner.id || l.toContactId === winner.id),
  ).length
  const moving = (
    [
      [loserActivities.length, 'Aktivität', 'Aktivitäten'],
      [loserReminders.filter((r) => !r.done).length, 'offener Reminder', 'offene Reminder'],
      [loser.sideFacts.length, 'Anknüpfungspunkt', 'Anknüpfungspunkte'],
      [loser.gallery?.length ?? 0, 'Foto', 'Fotos'],
      [loser.customers.length, 'Kunde', 'Kunden'],
      [movingLinks, 'Verknüpfung', 'Verknüpfungen'],
      [loserGifts.length, 'Geschenk', 'Geschenke'],
    ] as [number, string, string][]
  )
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)

  return (
    <div className="space-y-4">
      <Link to="/monitoring" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Monitoring
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dubletten zusammenführen</h1>
        <p className="text-sm text-muted-foreground">
          Wählen, welcher Kontakt bleibt. Alles, was am anderen hängt, zieht um — danach wird er gelöscht.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Welcher Kontakt bleibt">
        {(['a', 'b'] as const).map((s) => {
          const c = s === 'a' ? a : b
          const chosen = side === s
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => {
                setWinnerSide(s)
                setChoices({})
              }}
              className={cn(
                'rounded-xl border-2 bg-card p-4 text-left transition-colors',
                chosen ? 'border-primary' : 'border-border hover:border-muted-foreground/40',
              )}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {chosen ? 'Bleibt' : 'Wird gelöscht'}
              </div>
              <div className="mt-1 font-semibold">{c.fullName}</div>
              <div className="text-xs text-muted-foreground">
                {[c.position, c.company].filter(Boolean).join(' · ') || '—'}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {regionNames(c)} · angelegt {formatDate(c.createdAt)}
              </div>
            </button>
          )
        })}
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5 sm:pt-5">
          <h2 className="text-sm font-semibold">Felder</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine abweichenden Felder — „{loser.fullName}“ hat nichts, was „{winner.fullName}“ nicht auch hat.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <FieldRow
                  key={r.key}
                  row={r}
                  winnerName={winner.fullName}
                  loserName={loser.fullName}
                  choice={choices[r.key] ?? 'winner'}
                  onChoose={(c) => setChoices((prev) => ({ ...prev, [r.key]: c }))}
                  show={show}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-5 sm:pt-5">
          <h2 className="text-sm font-semibold">Zieht um</h2>
          <p className="text-sm">
            {moving.length > 0 ? moving.join(' · ') : 'Keine Einträge — nur die Felder oben.'}
          </p>
          <p className="text-xs text-muted-foreground">
            Dazu Gebiete, Event-Teilnahmen und Favoriten. Anknüpfungspunkte, Kunden und Gebiete werden vereint,
            doppelte nur einmal behalten. Eine Verknüpfung zwischen den beiden entfällt.
          </p>
          <div className="flex justify-end border-t border-border pt-3">
            <Button type="button" onClick={run} disabled={running}>
              <GitMerge className="size-4" />
              {running ? 'Führt zusammen…' : 'Zusammenführen'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function FieldRow({
  row,
  winnerName,
  loserName,
  choice,
  onChoose,
  show,
}: {
  row: MergeRow
  winnerName: string
  loserName: string
  choice: MergeChoice
  onChoose: (c: MergeChoice) => void
  show: (key: MergeField, v: unknown) => string
}) {
  if (!row.conflict) {
    return (
      <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
        <span className="w-44 shrink-0 text-xs text-muted-foreground">{row.label}</span>
        <span className="font-medium">{show(row.key, row.loser)}</span>
        <span className="text-xs text-info-ink">wird von „{loserName}“ übernommen</span>
      </li>
    )
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      <span className="w-44 shrink-0 text-xs text-muted-foreground">{row.label}</span>
      <div role="radiogroup" aria-label={row.label} className="flex flex-wrap gap-1.5">
        {(
          [
            ['winner', row.winner, winnerName],
            ['loser', row.loser, loserName],
          ] as const
        ).map(([c, v, who]) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={choice === c}
            title={`Wert von „${who}“`}
            onClick={() => onChoose(c)}
            className={cn(
              'max-w-72 truncate rounded-lg border px-2.5 py-1 text-left text-sm',
              choice === c ? 'border-primary/50 bg-primary-soft font-medium text-primary-ink' : 'border-border text-muted-foreground',
            )}
          >
            {show(row.key, v)}
          </button>
        ))}
      </div>
    </li>
  )
}
