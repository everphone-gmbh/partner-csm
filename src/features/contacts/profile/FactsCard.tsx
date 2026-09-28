import { useState } from 'react'
import { useUnsavedChangesEntry } from '@/app/UnsavedChangesScope'
import { Plus, X } from 'lucide-react'
import type { Contact, SideFact } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { LockedNote } from './shared'

export function FactsCard({
  contact,
  canEdit,
  canSensitive,
  onSave,
}: {
  contact: Contact
  canEdit: boolean
  canSensitive: boolean
  onSave: (patch: ContactPatch) => Promise<void>
}) {
  const [newFact, setNewFact] = useState('')
  const [saving, setSaving] = useState(false)

  const add = async (): Promise<boolean> => {
    const label = newFact.trim()
    if (!label) return true
    const next: SideFact[] = [
      ...contact.sideFacts,
      { id: crypto.randomUUID(), label, category: 'other' },
    ]
    setSaving(true)
    try {
      await onSave({ sideFacts: next })
      setNewFact('')
      return true
    } catch {
      return false // Toast kommt von ContactProfile, die Eingabe bleibt stehen
    } finally {
      setSaving(false)
    }
  }

  // Ein getippter, aber noch nicht hinzugefügter Anknüpfungspunkt ging beim
  // Wegklicken bisher still verloren.
  useUnsavedChangesEntry('anknuepfungspunkte', {
    isDirty: canEdit && canSensitive && !saving && newFact.trim() !== '',
    onSave: add,
  })
  const remove = (factId: string) =>
    void onSave({ sideFacts: contact.sideFacts.filter((f) => f.id !== factId) })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Anknüpfungspunkte</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!canSensitive ? (
          <LockedNote />
        ) : (
          <>
            {contact.sideFacts.length ? (
              <div className="flex flex-wrap gap-2">
                {contact.sideFacts.map((f) => (
                  <Badge key={f.id} variant="accent" className="gap-1">
                    {f.label}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => remove(f.id)}
                        aria-label={`${f.label} entfernen`}
                        className="hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Keine hinterlegt.</p>
            )}
            {canEdit && (
              <div className="flex gap-2">
                <Input
                  value={newFact}
                  onChange={(e) => setNewFact(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void add()
                    }
                  }}
                  placeholder="z. B. Segeln"
                />
                <Button type="button" variant="outline" onClick={() => void add()}>
                  <Plus className="size-4" /> Hinzufügen
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
