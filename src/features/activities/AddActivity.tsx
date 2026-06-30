import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { ActivityType } from '@/domain/types'
import { mockRepository } from '@/data/mockRepository'
import { useSession } from '@/app/SessionContext'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ACTIVITY_META } from './activityMeta'

const TYPES: ActivityType[] = ['note', 'call', 'email', 'meeting']

export function AddActivity({
  contactId,
  onAdded,
}: {
  contactId: string
  onAdded: () => void
}) {
  const { user } = useSession()
  const [type, setType] = useState<ActivityType>('note')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const text = body.trim()
    if (!text) return
    setSaving(true)
    try {
      await mockRepository.addActivity({
        contactId,
        type,
        occurredAt: new Date().toISOString(),
        authorId: user.id,
        authorName: user.name,
        body: text,
      })
      setBody('')
      onAdded()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
      <div className="flex flex-wrap gap-1">
        {TYPES.map((t) => {
          const { label, icon: Icon } = ACTIVITY_META[t]
          const active = type === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors',
                active
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3" /> {label}
            </button>
          )
        })}
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Was ist passiert? Beliebig lang — eine KI-Zusammenfassung wird automatisch erzeugt."
      />
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Sparkles className="size-3" /> wird als {user.name} gespeichert
        </span>
        <Button size="sm" onClick={submit} disabled={!body.trim() || saving}>
          {saving ? 'Speichern…' : 'Eintrag speichern'}
        </Button>
      </div>
    </div>
  )
}
