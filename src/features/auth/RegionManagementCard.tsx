import { useState } from 'react'
import { MapPin, Pencil, Plus } from 'lucide-react'
import { repository } from '@/data/repositoryProvider'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Selbstverwaltung der Vertriebsgebiete — nur für RM+ (in AccountPage über
 * canApprove gegated, serverseitig über RLS `regions_insert`/`regions_update`,
 * Migration 0029).
 *
 * Zeigt bewusst die vollständige Liste, damit niemand ein Gebiet doppelt anlegt.
 * Der Platzhalter „Unbekannt" (is_placeholder aus der Datenbank, 0024) wird
 * angezeigt, aber nicht zum Umbenennen angeboten — sonst hebelt eine Umbenennung
 * die Platzhalter-Logik aus (siehe Fallstrick 11).
 */
export function RegionManagementCard() {
  const { toast } = useToast()
  const { data, loading, error, retry } = useRepoQuery(() => repository.listRegions(), [])
  const regions = data ?? []

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Regionen verwalten</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Vertriebsgebiete umbenennen oder neue anlegen. Die Liste zeigt alle
          bestehenden Gebiete, damit nichts doppelt entsteht. Der Platzhalter lässt
          sich nicht umbenennen.
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
                      <button
                        type="button"
                        onClick={() => startEdit(r.id, r.name)}
                        aria-label={`${r.name} umbenennen`}
                        className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="size-3.5" /> Umbenennen
                      </button>
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
