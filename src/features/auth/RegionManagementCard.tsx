import { useMemo, useState } from 'react'
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { repository } from '@/data/repositoryProvider'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Selbstverwaltung der Vertriebsgebiete — nur für RM+ (in AccountPage über
 * canApprove gegated, serverseitig über RLS `regions_insert`/`regions_update`
 * (0029) und `regions_delete` (0030)).
 *
 * Zeigt bewusst die vollständige Liste, damit niemand ein Gebiet doppelt anlegt.
 * Der Platzhalter „Unbekannt" (is_placeholder aus der Datenbank, 0024) wird
 * angezeigt, aber weder zum Umbenennen noch zum Löschen angeboten — er ist Ziel
 * von „Zu Kontakt machen" und Default beim Import (siehe Fallstrick 11).
 *
 * Löschen erscheint nur bei LEEREN Gebieten (keine Kontakte, kein Nutzerprofil
 * gebunden) — benutzte Gebiete lehnt die Datenbank per FK ohnehin ab, der Knopf
 * würde also nur eine Fehlermeldung produzieren. Zusammenlegen = erst per
 * Massenzuordnung umziehen, dann die leere Hülle löschen.
 */
export function RegionManagementCard() {
  const { toast } = useToast()
  const { data, loading, error, retry } = useRepoQuery(
    () => Promise.all([repository.listRegions(), repository.listContacts(), repository.listUsers()]),
    [],
  )
  const regions = data?.[0] ?? []
  const contacts = data?.[1]
  const users = data?.[2]

  // Wie oft ein Gebiet verwendet wird (Kontakte + gebundene Nutzerprofile) —
  // entscheidet, ob Löschen überhaupt angeboten wird.
  const usedBy = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of contacts ?? []) m.set(c.regionId, (m.get(c.regionId) ?? 0) + 1)
    for (const u of users ?? []) {
      if (u.regionId) m.set(u.regionId, (m.get(u.regionId) ?? 0) + 1)
    }
    return m
  }, [contacts, users])

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const create = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      await repository.createRegion(name)
      setNewName('')
      retry()
      toast('Region angelegt.', 'success')
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  const startEdit = (id: string, name: string) => {
    setEditingId(id)
    setEditName(name)
  }

  const saveEdit = async (id: string) => {
    const name = editName.trim()
    if (!name) return
    setSavingId(id)
    try {
      await repository.renameRegion(id, name)
      setEditingId(null)
      retry()
      toast('Region umbenannt.', 'success')
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Region „${name}“ löschen?`)) return
    setSavingId(id)
    try {
      await repository.deleteRegion(id)
      retry()
      toast('Region gelöscht.', 'success')
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Regionen verwalten</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Vertriebsgebiete umbenennen, neue anlegen oder leere löschen. Die Liste
          zeigt alle bestehenden Gebiete, damit nichts doppelt entsteht. Löschen
          ist nur möglich, solange weder Kontakte noch Nutzer zugeordnet sind —
          zum Zusammenlegen die Kontakte erst per Massenzuordnung umziehen. Der
          Platzhalter lässt sich weder umbenennen noch löschen.
        </p>

        {error ? (
          <QueryError error={error} retry={retry} />
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Lädt…</p>
        ) : (
          <ul className="divide-y divide-border">
            {regions.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2">
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                {editingId === r.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      aria-label={`Neuer Name für ${r.name}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void saveEdit(r.id)
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={() => saveEdit(r.id)}
                      disabled={savingId === r.id || !editName.trim()}
                    >
                      {savingId === r.id ? 'Speichern…' : 'Speichern'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Abbrechen
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                    {r.isPlaceholder ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Platzhalter · nicht umbenennbar
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(r.id, r.name)}
                          aria-label={`${r.name} umbenennen`}
                          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="size-3.5" /> Umbenennen
                        </button>
                        {(usedBy.get(r.id) ?? 0) === 0 && (
                          <button
                            type="button"
                            onClick={() => remove(r.id, r.name)}
                            disabled={savingId === r.id}
                            aria-label={`${r.name} löschen`}
                            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" /> Löschen
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Neue Region, z. B. Südwest"
            aria-label="Name der neuen Region"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void create()
              }
            }}
          />
          <Button size="sm" onClick={create} disabled={creating || !newName.trim()}>
            <Plus className="size-4" /> {creating ? 'Anlegen…' : 'Anlegen'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
