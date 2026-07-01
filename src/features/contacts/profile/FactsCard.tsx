import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { Contact, SideFact } from '@/domain/types'
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
  onSave: (patch: Partial<Contact>) => Promise<void>
}) {
  const [newFact, setNewFact] = useState('')

  const add = () => {
    const label = newFact.trim()
    if (!label) return
    const next: SideFact[] = [
      ...contact.sideFacts,
      { id: `sf-local-${contact.sideFacts.length}-${label}`, label, category: 'other' },
    ]
    setNewFact('')
    void onSave({ sideFacts: next })
  }
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
                      add()
                    }
                  }}
                  placeholder="z. B. Segeln"
                />
                <Button type="button" variant="outline" onClick={add}>
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
