import { useState } from 'react'
import type { Contact } from '@/domain/types'
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
  onSave: (patch: Partial<Contact>) => Promise<void>
}) {
  const [text, setText] = useState(contact.freeText ?? '')
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
            onBlur={() => {
              if ((contact.freeText ?? '') !== text) void onSave({ freeText: text || undefined })
            }}
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
