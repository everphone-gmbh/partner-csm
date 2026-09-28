import { useState } from 'react'
import { useUnsavedChangesEntry } from '@/app/UnsavedChangesScope'
import type { Contact } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { LockedNote } from './shared'

export function NotizCard({
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
  const [text, setText] = useState(contact.freeText ?? '')
  const [saving, setSaving] = useState(false)

  // Gespeichert wird beim Verlassen des Feldes. Dazwischen liegt ein Fenster, in
  // dem Getipptes nur im Browser steht: Tab schließen, neu laden oder ein Klick
  // in der Handy-Leiste (der nicht zuverlässig ein Blur auslöst) — weg. Die
  // Anmeldung beim Seitenwächter schließt dieses Fenster.
  const saved = contact.freeText ?? ''
  const commit = async (): Promise<boolean> => {
    if (text === saved) return true
    setSaving(true)
    try {
      await onSave({ freeText: text || undefined })
      return true
    } catch {
      return false // den Fehler meldet ContactProfile als Toast, der Text bleibt stehen
    } finally {
      setSaving(false)
    }
  }
  useUnsavedChangesEntry('notiz', {
    isDirty: canEdit && canSensitive && !saving && text !== saved,
    onSave: commit,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notiz</CardTitle>
      </CardHeader>
      <CardContent>
        {!canSensitive ? (
          <LockedNote />
        ) : canEdit ? (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => void commit()}
            rows={3}
            placeholder="Notiz hinzufügen…"
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {contact.freeText || <span className="text-muted-foreground">—</span>}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
