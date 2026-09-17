import { useEffect, useMemo, useState } from 'react'
import type { AppUser, Region, Role } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { canManageTeam, ROLE_LABEL } from '@/domain/roles'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { selectCls } from '@/features/contacts/profile/shared'

const ROLES: Role[] = ['overall_admin', 'sub_admin', 'account_manager']

/**
 * Team & Rechte — Rolle und Region vorhandener Konten (Migration 0033).
 *
 * Bis hierher war jede Personalie ein Zuruf: `profiles` hatte nur eine
 * SELECT-Policy, Rollen liessen sich ausschliesslich per SQL ändern.
 *
 * Bewusst KEIN Anlegen neuer Logins: das braucht die Supabase-Admin-API und
 * damit den Service-Role-Key, der nie im Browser liegen darf. Dafür kommt
 * Google SSO (Entscheidung 2026-09-17).
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
        ? Promise.all([repository.listUsers(), repository.listRegions()])
        : Promise.resolve(undefined),
    [allowed],
  )

  // Eigener Zustand neben der Abfrage, weil die Auswahl optimistisch stehen
  // soll (wie der Favoritenstern) — die Liste wird beim Speichern fortgeschrieben
  // statt neu geladen.
  const [users, setUsers] = useState<AppUser[] | undefined>(undefined)
  useEffect(() => {
    if (data) setUsers(data[0])
  }, [data])
  const regions: Region[] = data?.[1] ?? []

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team &amp; Rechte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Neue Logins lassen sich hier noch nicht anlegen — das kommt mit Google SSO; bis dahin
            legt Jannik sie an.
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
