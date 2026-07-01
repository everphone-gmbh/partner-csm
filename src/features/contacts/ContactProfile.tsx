import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Pencil,
  Cake,
  Mail,
  MapPin,
  Heart,
  Users,
  PawPrint,
  Smartphone,
  Trophy,
  Lock,
  Sparkles,
  Building2,
  ExternalLink,
  Plus,
  X,
} from 'lucide-react'
import type {
  AppUser,
  Contact,
  LinkedInInfo,
  LinkedInStatus,
  Region,
  SideFact,
} from '@/domain/types'
import { mockRepository } from '@/data/mockRepository'
import { useSession } from '@/app/SessionContext'
import {
  canApprove,
  canViewSensitiveFields,
  redactContactForRole,
  ROLE_LABEL,
} from '@/domain/roles'
import { localSummarizer } from '@/domain/ai'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EditableAvatar } from '@/components/EditableAvatar'
import { TrafficLightBadge, TrafficLightPicker } from '@/components/TrafficLight'
import { LinkedInField, LinkedInPicker } from '@/components/LinkedInField'
import { Logbook } from '@/features/activities/Logbook'
import { formatDate, daysUntilBirthday } from '@/lib/format'

const selectCls =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function ContactProfile() {
  const { id } = useParams()
  const { user } = useSession()
  const [raw, setRaw] = useState<Contact | undefined>(undefined)
  const [regions, setRegions] = useState<Region[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true)
    Promise.all([
      mockRepository.getContact(id),
      mockRepository.listRegions(),
      mockRepository.listUsers(),
    ]).then(([c, r, u]) => {
      if (!active) return
      setRaw(c)
      setRegions(r)
      setUsers(u)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  const canEdit = canApprove(user.role)
  const canSensitive = canViewSensitiveFields(user.role)
  const view = useMemo(
    () => (raw ? redactContactForRole(raw, user.role) : undefined),
    [raw, user.role],
  )

  const regionName = view ? regions.find((r) => r.id === view.regionId)?.name : undefined
  const managerName = view ? users.find((u) => u.id === view.relationshipManagerId)?.name : undefined

  const aiIntro = useMemo(
    () => (view ? localSummarizer.contactIntro(view, { regionName, managerName }) : ''),
    [view, regionName, managerName],
  )

  const save = async (patch: Partial<Contact>) => {
    if (!raw) return
    const updated = await mockRepository.updateContact(raw.id, patch)
    setRaw(updated)
  }

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>
  if (!view) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="text-sm text-muted-foreground">Kontakt nicht gefunden.</p>
      </div>
    )
  }

  const withUs = view.customers.filter((c) => c.withUs)
  const withoutUs = view.customers.filter((c) => !c.withUs)

  return (
    <div className="space-y-4">
      <BackLink />

      {/* Identity — Facebook-style cover + overlapping avatar */}
      <Card className="overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary via-primary to-teal/70" />
        <CardContent className="pt-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="-mt-10">
              <EditableAvatar
                src={view.photoUrl}
                name={view.fullName}
                onChange={(photoUrl) => save({ photoUrl })}
                className="rounded-full ring-4 ring-card"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <h1 className="text-xl font-semibold leading-tight">{view.fullName}</h1>
                <p className="text-sm text-muted-foreground">{view.position || '—'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{regionName ?? '—'}</Badge>
                <span>RM: {managerName ?? '—'}</span>
              </div>
              <LinkedInInline
                info={view.linkedin}
                canEdit={canEdit}
                verifierName={user.name}
                onSave={save}
              />
            </div>
            <div className="shrink-0">
              {canEdit ? (
                <div className="space-y-1">
                  <Label>Beziehung</Label>
                  <TrafficLightPicker value={view.sentiment} onChange={(s) => save({ sentiment: s })} />
                </div>
              ) : (
                <TrafficLightBadge value={view.sentiment} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI summary — pinned prominently at the top */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex gap-3 pt-5">
          <Sparkles className="size-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-primary">
              KI-Zusammenfassung
            </div>
            <p className="text-sm text-foreground">{aiIntro}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_minmax(320px,380px)]">
        <div className="space-y-4">
          <StammdatenCard
            contact={view}
            canEdit={canEdit}
            canSensitive={canSensitive}
            regions={regions}
            users={users}
            onSave={save}
          />
          <FactsCard contact={view} canEdit={canEdit} canSensitive={canSensitive} onSave={save} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kunden</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CustomerGroup title="Mit uns" customers={withUs} />
              <CustomerGroup title="Ohne uns (Potenzial)" customers={withoutUs} />
              {view.customers.length === 0 && (
                <p className="text-sm text-muted-foreground">Keine Kunden zugeordnet.</p>
              )}
            </CardContent>
          </Card>
          <NotizCard contact={view} canEdit={canEdit} canSensitive={canSensitive} onSave={save} />
        </div>

        {/* Right: logbook (stacks below on mobile) */}
        <Logbook contactId={view.id} />
      </div>
    </div>
  )
}

// --- Stammdaten (pencil-toggle inline edit) ---

interface StammDraft {
  fullName: string
  position: string
  regionId: string
  relationshipManagerId: string
  email: string
  birthday: string
  location: string
  familyStatus: string
  children: string
  pets: string
  activeDevices: string
  wonCustomersCount: string
}

function toStammDraft(c: Contact): StammDraft {
  return {
    fullName: c.fullName,
    position: c.position,
    regionId: c.regionId,
    relationshipManagerId: c.relationshipManagerId,
    email: c.email ?? '',
    birthday: c.birthday ?? '',
    location: c.location ?? '',
    familyStatus: c.familyStatus ?? '',
    children: c.children ?? '',
    pets: c.pets ?? '',
    activeDevices: c.activeDevices ?? '',
    wonCustomersCount: String(c.wonCustomersCount ?? 0),
  }
}

function StammdatenCard({
  contact,
  canEdit,
  canSensitive,
  regions,
  users,
  onSave,
}: {
  contact: Contact
  canEdit: boolean
  canSensitive: boolean
  regions: Region[]
  users: AppUser[]
  onSave: (patch: Partial<Contact>) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<StammDraft>(() => toStammDraft(contact))
  const [saving, setSaving] = useState(false)
  const bdayDays = canSensitive ? daysUntilBirthday(contact.birthday) : null

  const set = <K extends keyof StammDraft,>(k: K, v: StammDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  const start = () => {
    setDraft(toStammDraft(contact))
    setEditing(true)
  }
  const submit = async () => {
    setSaving(true)
    try {
      await onSave({
        fullName: draft.fullName.trim() || contact.fullName,
        position: draft.position.trim(),
        regionId: draft.regionId,
        relationshipManagerId: draft.relationshipManagerId,
        email: draft.email.trim() || undefined,
        birthday: draft.birthday || undefined,
        location: draft.location.trim() || undefined,
        familyStatus: draft.familyStatus.trim() || undefined,
        children: draft.children.trim() || undefined,
        pets: draft.pets.trim() || undefined,
        activeDevices: draft.activeDevices.trim() || undefined,
        wonCustomersCount: Number(draft.wonCustomersCount) || 0,
      })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Stammdaten</CardTitle>
        {canEdit && !editing && <EditButton onClick={start} />}
      </CardHeader>
      <CardContent className={editing ? 'space-y-3' : 'divide-y divide-border'}>
        {editing ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <EditField label="Name">
                <Input value={draft.fullName} onChange={(e) => set('fullName', e.target.value)} />
              </EditField>
              <EditField label="Funktion">
                <Input value={draft.position} onChange={(e) => set('position', e.target.value)} />
              </EditField>
              <EditField label="Region">
                <select className={selectCls} value={draft.regionId} onChange={(e) => set('regionId', e.target.value)}>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </EditField>
              <EditField label="Relationship Manager">
                <select
                  className={selectCls}
                  value={draft.relationshipManagerId}
                  onChange={(e) => set('relationshipManagerId', e.target.value)}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {ROLE_LABEL[u.role]}
                    </option>
                  ))}
                </select>
              </EditField>
              <EditField label="E-Mail">
                <Input type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} />
              </EditField>
              <EditField label="Geburtstag">
                <Input type="date" value={draft.birthday} onChange={(e) => set('birthday', e.target.value)} />
              </EditField>
              <EditField label="Wohnort">
                <Input value={draft.location} onChange={(e) => set('location', e.target.value)} />
              </EditField>
              <EditField label="Familienstand">
                <Input value={draft.familyStatus} onChange={(e) => set('familyStatus', e.target.value)} />
              </EditField>
              <EditField label="Kinder">
                <Input value={draft.children} onChange={(e) => set('children', e.target.value)} />
              </EditField>
              <EditField label="Haustiere">
                <Input value={draft.pets} onChange={(e) => set('pets', e.target.value)} />
              </EditField>
              <EditField label="Active Devices">
                <Input value={draft.activeDevices} onChange={(e) => set('activeDevices', e.target.value)} />
              </EditField>
              <EditField label="Gewonnene Kunden">
                <Input
                  type="number"
                  min={0}
                  value={draft.wonCustomersCount}
                  onChange={(e) => set('wonCustomersCount', e.target.value)}
                />
              </EditField>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
              <Button size="sm" onClick={submit} disabled={saving}>
                {saving ? 'Speichern…' : 'Speichern'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <FieldRow icon={Cake} label="Geburtstag" locked={!canSensitive}>
              {formatDate(contact.birthday)}
              {bdayDays !== null && bdayDays <= 30 && (
                <Badge variant="warning" className="ml-2">
                  {bdayDays === 0 ? 'heute' : `in ${bdayDays} Tg.`}
                </Badge>
              )}
            </FieldRow>
            <FieldRow icon={Mail} label="E-Mail">
              {contact.email ? (
                <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                  {contact.email}
                </a>
              ) : (
                '—'
              )}
            </FieldRow>
            <FieldRow icon={MapPin} label="Wohnort" locked={!canSensitive}>
              {contact.location || '—'}
            </FieldRow>
            <FieldRow icon={Heart} label="Familienstand" locked={!canSensitive}>
              {contact.familyStatus || '—'}
            </FieldRow>
            <FieldRow icon={Users} label="Kinder" locked={!canSensitive}>
              {contact.children || '—'}
            </FieldRow>
            <FieldRow icon={PawPrint} label="Haustiere" locked={!canSensitive}>
              {contact.pets || '—'}
            </FieldRow>
            <FieldRow icon={Smartphone} label="Active Devices" locked={!canSensitive}>
              {contact.activeDevices || '—'}
            </FieldRow>
            <FieldRow icon={Trophy} label="Gewonnene Kunden">
              {contact.wonCustomersCount}
            </FieldRow>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// --- Anknüpfungspunkte (always-inline add/remove when editable) ---

function FactsCard({
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

// --- Notiz (inline textarea, saves on blur) ---

function NotizCard({
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

// --- LinkedIn inline (pencil toggle) ---

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

// --- shared bits ---

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <Pencil className="size-3.5" /> Bearbeiten
    </button>
  )
}

function EditField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/contacts"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Alle Kontakte
    </Link>
  )
}

function LockedNote() {
  return (
    <p className="inline-flex items-center gap-1.5 text-sm italic text-muted-foreground">
      <Lock className="size-3.5" /> Für Ihre Rolle ausgeblendet
    </p>
  )
}

function FieldRow({
  icon: Icon,
  label,
  locked,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  locked?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {locked ? (
          <div className="inline-flex items-center gap-1.5 text-sm italic text-muted-foreground">
            <Lock className="size-3.5" /> Für Ihre Rolle ausgeblendet
          </div>
        ) : (
          <div className="break-words text-sm text-foreground">{children}</div>
        )}
      </div>
    </div>
  )
}

function CustomerGroup({
  title,
  customers,
}: {
  title: string
  customers: Contact['customers']
}) {
  if (customers.length === 0) return null
  return (
    <div className="space-y-1.5">
      <Label>{title}</Label>
      <div className="space-y-1.5">
        {customers.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
          >
            <span className="inline-flex min-w-0 items-center gap-2 text-sm">
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{c.name}</span>
            </span>
            {c.salesforceUrl && (
              <a
                href={c.salesforceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
              >
                Salesforce <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
