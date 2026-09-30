import { useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import type { OrgUnit } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { FieldHint } from '@/components/ui/notice'
import { useConfirm } from '@/components/ui/useConfirm'
import { useMissingHint } from '@/lib/useMissingHint'
import { cn } from '@/lib/utils'

interface Draft {
  company: string
  department: string
  team: string
  note: string
}


/**
 * Die Telekom-Soll-Struktur pflegen, gegen die die Abdeckung misst. Bisher ging
 * jede Änderung nur per SQL — die Seite schrieb selbst dazu, die Struktur „muss
 * nachgezogen werden", ohne einen Weg dafür anzubieten.
 *
 * Nur für die Leitung; serverseitig seit 0037 ebenso. Nichts verweist per
 * Schlüssel auf eine Einheit (die Abdeckung vergleicht Namen) — Löschen ist
 * deshalb unbedenklich, ändert aber die Quote.
 */
export function StructureCard({ units, onChanged }: { units: OrgUnit[]; onChanged: () => void }) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const saveHint = useMissingHint()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>({ company: '', department: '', team: '', note: '' })
  const [saving, setSaving] = useState(false)

  const sorted = [...units].sort(
    (a, b) =>
      a.company.localeCompare(b.company, 'de') ||
      a.department.localeCompare(b.department, 'de') ||
      (a.team ?? '').localeCompare(b.team ?? '', 'de'),
  )

  // Neue Einheiten übernehmen die häufigste Firmen-Schreibweise der Struktur —
  // eine abweichende Schreibweise ließe die Abdeckung sie als andere Firma zählen.
  const commonCompany = (() => {
    const counts = new Map<string, number>()
    for (const u of units) counts.set(u.company, (counts.get(u.company) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  })()

  const start = (u?: OrgUnit) => {
    setDraft(
      u
        ? { company: u.company, department: u.department, team: u.team ?? '', note: u.note ?? '' }
        : { company: commonCompany, department: '', team: '', note: '' },
    )
    setEditingId(u?.id ?? 'new')
  }

  const save = async () => {
    if (!saveHint.check(!draft.company.trim() || !draft.department.trim())) return
    setSaving(true)
    try {
      if (editingId === 'new') {
        await repository.createOrgUnit({
          company: draft.company,
          department: draft.department,
          team: draft.team || undefined,
          note: draft.note || undefined,
        })
        toast('Einheit angelegt.', 'success')
      } else if (editingId) {
        await repository.updateOrgUnit(editingId, {
          company: draft.company,
          department: draft.department,
          team: draft.team || null,
          note: draft.note || null,
        })
        toast('Einheit gespeichert.', 'success')
      }
      setEditingId(null)
      onChanged()
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (u: OrgUnit) => {
    const label = [u.department, u.team].filter(Boolean).join(' · ')
    const ok = await confirm({
      title: `„${label}“ aus der Struktur löschen?`,
      message: 'Die Abdeckung rechnet danach ohne diese Einheit.',
      confirmLabel: 'Einheit löschen',
      cancelLabel: 'Behalten',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await repository.deleteOrgUnit(u.id)
      toast('Einheit gelöscht.', 'success')
      onChanged()
    } catch (err) {
      toast(saveErrorMessage(err))
    }
  }

  const form = (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-secondary/40 p-3 sm:grid-cols-4">
      <Input value={draft.company} onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))} placeholder="Firma" aria-label="Firma" />
      <Input value={draft.department} onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))} placeholder="Abteilung" aria-label="Abteilung" autoFocus />
      <Input value={draft.team} onChange={(e) => setDraft((d) => ({ ...d, team: e.target.value }))} placeholder="Team (optional)" aria-label="Team" />
      <Input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder="Notiz (optional)" aria-label="Notiz" />
      {saveHint.tried && (!draft.company.trim() || !draft.department.trim()) && (
        <FieldHint className="sm:col-span-4">Gib Firma und Abteilung ein.</FieldHint>
      )}
      <div className="flex gap-2 sm:col-span-4">
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving ? 'Speichern…' : 'Speichern'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={saving}>
          Abbrechen
        </Button>
      </div>
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between text-left"
        >
          <span>
            <CardTitle className="text-base">Telekom-Struktur pflegen</CardTitle>
            <span className="text-xs text-muted-foreground">
              {units.length} Einheiten — der Maßstab, gegen den die Abdeckung misst
            </span>
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2">
          <ul className="divide-y divide-border">
            {sorted.map((u) =>
              editingId === u.id ? (
                <li key={u.id} className="py-2">
                  {form}
                </li>
              ) : (
                <li key={u.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-medium">{u.department}</span>
                      {u.team && <span className="text-muted-foreground"> · {u.team}</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {u.company}
                      {u.note ? ` · ${u.note}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => start(u)}
                    aria-label={`${u.department} bearbeiten`}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(u)}
                    aria-label={`${u.department} löschen`}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ),
            )}
          </ul>
          {editingId === 'new' ? (
            form
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => start()}>
              <Plus className="size-4" /> Einheit hinzufügen
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  )
}
