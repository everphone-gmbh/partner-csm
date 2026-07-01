import { useState } from 'react'
import { Pencil } from 'lucide-react'
import type { Contact, LinkedInInfo, LinkedInStatus, SentimentEntry, TrafficLight } from '@/domain/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EditableAvatar } from '@/components/EditableAvatar'
import { TrafficLightBadge, TrafficLightDot, TrafficLightPicker } from '@/components/TrafficLight'
import { LinkedInField, LinkedInPicker } from '@/components/LinkedInField'
import { formatDate } from '@/lib/format'

export function IdentityCard({
  contact,
  canEdit,
  regionName,
  managerName,
  viewerName,
  onSave,
}: {
  contact: Contact
  canEdit: boolean
  regionName?: string
  managerName?: string
  viewerName: string
  onSave: (patch: Partial<Contact>) => Promise<void>
}) {
  const rateSentiment = (value: TrafficLight) => {
    const history: SentimentEntry[] = [
      ...(contact.sentimentHistory ?? []),
      { at: new Date().toISOString(), value, byName: viewerName },
    ]
    void onSave({ sentiment: value, sentimentHistory: history })
  }

  return (
    <Card className="overflow-hidden">
      <div className="h-20 bg-gradient-to-r from-primary via-primary to-teal/70" />
      <CardContent className="pt-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="-mt-10">
            <EditableAvatar
              src={contact.photoUrl}
              name={contact.fullName}
              onChange={(photoUrl) => onSave({ photoUrl })}
              className="rounded-full ring-4 ring-card"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <h1 className="text-xl font-semibold leading-tight">{contact.fullName}</h1>
              <p className="text-sm text-muted-foreground">{contact.position || '—'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{regionName ?? '—'}</Badge>
              <span>RM: {managerName ?? '—'}</span>
            </div>
            <LinkedInInline
              info={contact.linkedin}
              canEdit={canEdit}
              verifierName={viewerName}
              onSave={onSave}
            />
          </div>
          <div className="shrink-0 space-y-1">
            {canEdit ? (
              <>
                <Label>Beziehung</Label>
                <TrafficLightPicker value={contact.sentiment} onChange={rateSentiment} />
              </>
            ) : (
              <TrafficLightBadge value={contact.sentiment} />
            )}
            {(contact.sentimentHistory?.length ?? 0) > 0 && (
              <SentimentHistory entries={contact.sentimentHistory ?? []} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SentimentHistory({ entries }: { entries: SentimentEntry[] }) {
  const recent = [...entries].slice(-4).reverse()
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
      <span>Verlauf:</span>
      {recent.map((e, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <TrafficLightDot value={e.value} />
          {formatDate(e.at)}
        </span>
      ))}
    </div>
  )
}

function LinkedInInline({
  info,
  canEdit,
  verifierName,
  onSave,
}: {
  info: LinkedInInfo
  canEdit: boolean
  verifierName: string
  onSave: (patch: Partial<Contact>) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState<LinkedInStatus>(info.status)
  const [url, setUrl] = useState(info.url ?? '')

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <LinkedInField info={info} />
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setStatus(info.status)
              setUrl(info.url ?? '')
              setEditing(true)
            }}
            aria-label="LinkedIn bearbeiten"
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
    )
  }

  const commit = async () => {
    const next: LinkedInInfo = { status }
    if (status === 'has_account' && url.trim()) next.url = url.trim()
    if (status !== 'unknown') {
      next.verifiedByName = verifierName
      next.verifiedAt = new Date().toISOString().slice(0, 10)
    }
    await onSave({ linkedin: next })
    setEditing(false)
  }

  return (
    <div className="space-y-2">
      <LinkedInPicker status={status} onChange={setStatus} />
      {status === 'has_account' && (
        <Input
          type="url"
          placeholder="https://www.linkedin.com/in/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={commit}>
          Speichern
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Abbrechen
        </Button>
      </div>
    </div>
  )
}
