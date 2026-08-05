import { useState } from 'react'
import { Pencil } from 'lucide-react'
import type { Contact, LinkedInInfo, LinkedInStatus, SentimentEntry, TrafficLight } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'
import { buildLinkedInInfo } from '@/domain/linkedin'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EditableAvatar } from '@/components/EditableAvatar'
import { telHref } from './shared'
import { TrafficLightBadge, TrafficLightDot, TrafficLightPicker } from '@/components/TrafficLight'
import { SentimentSparkline } from '@/components/SentimentSparkline'
import { BUYING_ROLE_LABEL, BUYING_ROLE_VARIANT } from '@/domain/buyingCenter'
import { LinkedInField, LinkedInPicker } from '@/components/LinkedInField'
import { safeLinkedInUrl } from '@/domain/urls'
import { formatDate } from '@/lib/format'

function LinkedInLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  )
}

/** Runder LinkedIn-Button im Markenblau — nur bei valider Profil-URL sichtbar. */
function LinkedInButton({ url, contactName }: { url?: string; contactName: string }) {
  const safe = safeLinkedInUrl(url)
  if (!safe) return null
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      title="LinkedIn-Profil öffnen"
      aria-label={`LinkedIn-Profil von ${contactName} öffnen`}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#0A66C2] text-white transition-opacity hover:opacity-85"
    >
      <LinkedInLogo className="size-4" />
    </a>
  )
}

export function IdentityCard({
  contact,
  canEdit,
  regionName,
  regionIsPlaceholder,
  managerName,
  viewerId,
  viewerName,
  onSave,
}: {
  contact: Contact
  canEdit: boolean
  regionName?: string
  /** Kennzeichnet „Unbekannt“ & Co. als Platzhalter statt als echtes Gebiet. */
  regionIsPlaceholder?: boolean
  managerName?: string
  viewerId: string
  viewerName: string
  onSave: (patch: ContactPatch) => Promise<void>
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
              folder={contact.id}
              editable={canEdit}
              onChange={(photoUrl) => onSave({ photoUrl })}
              className="rounded-full ring-4 ring-card"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight leading-tight">{contact.fullName}</h1>
                <LinkedInButton url={contact.linkedin.url} contactName={contact.fullName} />
              </div>
              <p className="text-sm text-muted-foreground">{contact.position || '—'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge
                variant={regionIsPlaceholder ? 'warning' : 'secondary'}
                title={regionIsPlaceholder ? 'Platzhalter, keine echte Region' : undefined}
              >
                {regionName ?? '—'}
                {regionIsPlaceholder ? ' (Platzhalter)' : ''}
              </Badge>
              {contact.buyingRole && (
                <Badge variant={BUYING_ROLE_VARIANT[contact.buyingRole]}>
                  {BUYING_ROLE_LABEL[contact.buyingRole]}
                </Badge>
              )}
              <span>RM: {managerName ?? '—'}</span>
            </div>
            {/*
              Direktkontakt: anklickbar, damit ein Anruf vom Handy aus einem Tipp
              besteht. Die PRIVATE Nummer steht hier bewusst nicht — sie gehört
              nicht prominent auf jeden Bildschirm, sondern in die Stammdaten mit
              Schloss-Kennzeichnung.
            */}
            {(contact.email || contact.phoneMobile || contact.phoneWork) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                    {contact.email}
                  </a>
                )}
                {contact.phoneMobile && (
                  <a href={telHref(contact.phoneMobile)} className="text-primary hover:underline">
                    Mobil {contact.phoneMobile}
                  </a>
                )}
                {contact.phoneWork && (
                  <a href={telHref(contact.phoneWork)} className="text-primary hover:underline">
                    Tel {contact.phoneWork}
                  </a>
                )}
              </div>
            )}
            <LinkedInInline
              info={contact.linkedin}
              canEdit={canEdit}
              verifierId={viewerId}
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
            {(contact.sentimentHistory?.length ?? 0) > 1 ? (
              <div className="mt-1">
                <SentimentSparkline entries={contact.sentimentHistory ?? []} />
              </div>
            ) : (
              (contact.sentimentHistory?.length ?? 0) > 0 && (
                <SentimentHistory entries={contact.sentimentHistory ?? []} />
              )
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
  verifierId,
  verifierName,
  onSave,
}: {
  info: LinkedInInfo
  canEdit: boolean
  verifierId: string
  verifierName: string
  onSave: (patch: ContactPatch) => Promise<void>
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
    const next = buildLinkedInInfo(
      status,
      url,
      info,
      { id: verifierId, name: verifierName },
      new Date().toISOString().slice(0, 10),
    )
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
