import { useEffect, useMemo, useState } from 'react'
import type { AppUser, PendingAccount, Region, Role } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { canManageTeam, ROLE_LABEL } from '@/domain/roles'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { selectCls } from '@/features/contacts/profile/shared'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'

const ROLES: Role[] = ['overall_admin', 'sub_admin', 'account_manager']

/**
 * Team & Rechte — Rolle und Region vorhandener Konten (Migration 0033).
 *
 * Bis hierher war jede Personalie ein Zuruf: `profiles` hatte nur eine
 * SELECT-Policy, Rollen liessen sich ausschliesslich per SQL ändern.
 *
 * Neue Logins entstehen nicht hier, sondern mit der Google-Anmeldung: wer sich
 * mit seinem Everphone-Konto anmeldet, erscheint unter „Wartet auf
 * Freischaltung" und sieht bis dahin nichts (0040). Die Leitung vergibt Rolle
 * und Region in einem Schritt. Konten von Hand anzulegen bräuchte den
 * Service-Role-Key, der nie im Browser liegen darf.
 *
 * Die beiden Selbstsperren des Triggers `profiles_guard_change` spiegelt die
 * Oberfläche, damit niemand erst in eine Fehlermeldung klickt: das eigene
 * Rollenfeld und das des letzten verbliebenen Administrators sind deaktiviert.
 * Die Region bleibt in beiden Fällen änderbar — sie ist von den Sperren nicht
 * betroffen. Der Server bleibt trotzdem die entscheidende Instanz; die
 * Oberfläche ist nur die Bequemlichkeit davor.
 */
export function TeamPage() {
  const { user } = useSession()
  const { toast } = useToast()
  const allowed = canManageTeam(user.role)

  const { data, loading, error, retry } = useRepoQuery(
    () =>
      allowed
        ? Promise.all([repository.listUsers(), repository.listRegions(), repository.listPendingAccounts()])
        : Promise.resolve(undefined),
    [allowed],
  )

  // Eigener Zustand neben der Abfrage, weil die Auswahl optimistisch stehen
  // soll (wie der Favoritenstern) — die Liste wird beim Speichern fortgeschrieben
  // statt neu geladen.
  const [users, setUsers] = useState<AppUser[] | undefined>(undefined)
  const [pending, setPending] = useState<PendingAccount[]>([])
  useEffect(() => {
    if (data) {
      setUsers(data[0])
      setPending(data[2])
    }
  }, [data])
  const regions: Region[] = data?.[1] ?? []

  const approve = async (account: PendingAccount, role: Role, regionId: string) => {
    try {
      const saved = await repository.approveAccount(account.id, role, regionId || undefined)
      setPending((list) => list.filter((p) => p.id !== account.id))
      setUsers((list) => [...(list ?? []), saved])
      toast(`${saved.name} ist freigeschaltet.`, 'success')
    } catch (err) {
      toast(saveErrorMessage(err))
    }
  }

  const sorted = useMemo(
    () => [...(users ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [users],
  )
  const adminCount = (users ?? []).filter((u) => u.role === 'overall_admin').length

  const save = async (target: AppUser, patch: { role?: Role; regionId?: string | null }) => {
    const optimistic: AppUser = { ...target }
    if (patch.role !== undefined) optimistic.role = patch.role
    if (patch.regionId !== undefined) optimistic.regionId = patch.regionId ?? undefined
    setUsers((list) => (list ?? []).map((u) => (u.id === target.id ? optimistic : u)))

    try {
      const saved = await repository.updateUser(target.id, patch)
      setUsers((list) => (list ?? []).map((u) => (u.id === saved.id ? saved : u)))
    } catch (err) {
      // Rücknahme nur DIESER Zeile und auf Basis des aktuellen Stands: an einer
      // anderen Zeile kann inzwischen gespeichert worden sein.
      setUsers((list) => (list ?? []).map((u) => (u.id === target.id ? target : u)))
      toast(saveErrorMessage(err))
    }
  }

  // Eigene Sperre der Seite. /coverage, /report und /monitoring haben dieselbe;
  // MonitoringPage ging einmal ohne live, und die Adresse liess sich dann
  // einfach tippen. Serverseitig hält die Policy profiles_update (0033), aber
  // eine Tabelle, die dann beim Speichern reihenweise Fehler wirft, ist keine
  // Absage — sie ist eine Falle.
  if (!allowed) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Rollen und Regionen darf nur der Overall Admin vergeben.
      </p>
    )
  }
  if (error) return <QueryError error={error} retry={retry} />
  if (loading || !users) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">Rollen und Regionen der Konten</p>
      </div>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Wartet auf Freischaltung ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Diese Konten haben sich mit Google angemeldet und sehen noch nichts. Mit Rolle und
              Region freischalten — Account Manager brauchen eine Region.
            </p>
            <ul className="divide-y divide-border">
              {pending.map((p) => (
                <PendingRow key={p.id} account={p} regions={regions} onApprove={approve} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team &amp; Rechte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Neue Kolleg:innen melden sich mit ihrem Everphone-Google-Konto an und erscheinen dann
            oben zur Freischaltung — bis dahin sehen sie nichts.
          </p>

          <ul className="divide-y divide-border">
            {sorted.map((u) => {
              const isSelf = u.id === user.id
              const isLastAdmin = u.role === 'overall_admin' && adminCount <= 1
              const roleLocked = isSelf
                ? 'Die eigene Rolle lässt sich nicht ändern — sonst klickt man sich versehentlich aus der Verwaltung.'
                : isLastAdmin
                  ? 'Der letzte Overall Admin lässt sich nicht herabstufen — sonst darf niemand mehr Rollen vergeben.'
                  : undefined
              return (
                <li
                  key={u.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{u.name}</span>
                  <select
                    className={`${selectCls} sm:w-52`}
                    aria-label={`Rolle von ${u.name}`}
                    value={u.role}
                    disabled={roleLocked !== undefined}
                    title={roleLocked}
                    onChange={(e) => void save(u, { role: e.target.value as Role })}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <select
                    className={`${selectCls} sm:w-44`}
                    aria-label={`Region von ${u.name}`}
                    value={u.regionId ?? ''}
                    onChange={(e) => void save(u, { regionId: e.target.value || null })}
                  >
                    {/* Leere Option, weil regionId optional ist — RMs haben oft keine. */}
                    <option value="">Keine Region</option>
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function PendingRow({
  account,
  regions,
  onApprove,
}: {
  account: PendingAccount
  regions: Region[]
  onApprove: (account: PendingAccount, role: Role, regionId: string) => Promise<void>
}) {
  const [role, setRole] = useState<Role>('account_manager')
  const [regionId, setRegionId] = useState('')
  const [busy, setBusy] = useState(false)
  const needsRegion = role === 'account_manager' && !regionId

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{account.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {account.email} · angemeldet am {formatDate(account.createdAt)}
        </span>
      </span>
      <select
        className={`${selectCls} sm:w-44`}
        aria-label={`Rolle für ${account.name}`}
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <select
        className={`${selectCls} sm:w-40`}
        aria-label={`Region für ${account.name}`}
        value={regionId}
        onChange={(e) => setRegionId(e.target.value)}
      >
        <option value="">{role === 'account_manager' ? 'Region wählen' : 'Keine Region'}</option>
        {regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        disabled={busy || needsRegion}
        title={needsRegion ? 'Account Manager brauchen eine Region' : undefined}
        onClick={async () => {
          setBusy(true)
          await onApprove(account, role, regionId)
          setBusy(false)
        }}
      >
        {busy ? 'Schaltet frei…' : 'Freischalten'}
      </Button>
    </li>
  )
}
