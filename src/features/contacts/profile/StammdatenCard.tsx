import { useState } from 'react'
import { Briefcase, Cake, Mail, MapPin, Heart, Users, PawPrint, Repeat, Smartphone, Trophy } from 'lucide-react'
import type { AppUser, Contact, Region } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'
import { ROLE_LABEL } from '@/domain/roles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatDate, daysUntilBirthday } from '@/lib/format'
import { EditButton, EditField, FieldRow, selectCls } from './shared'

interface StammDraft {
  fullName: string
  position: string
  regionId: string
  relationshipManagerId: string
  team: string
  email: string
  birthday: string
  location: string
  familyStatus: string
  children: string
  pets: string
  activeDevices: string
  wonCustomersCount: string
  cadenceDays: string
}

/** Cadence options; '' = global 60/90 default. */
const CADENCE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Standard (60/90 Tage)' },
  { value: '30', label: 'Alle 30 Tage (A-Kontakt)' },
  { value: '60', label: 'Alle 60 Tage' },
  { value: '90', label: 'Alle 90 Tage' },
  { value: '180', label: 'Alle 180 Tage' },
]

function toStammDraft(c: Contact): StammDraft {
  return {
    fullName: c.fullName,
    position: c.position,
    regionId: c.regionId,
    relationshipManagerId: c.relationshipManagerId,
    team: c.team ?? '',
    email: c.email ?? '',
    birthday: c.birthday ?? '',
    location: c.location ?? '',
    familyStatus: c.familyStatus ?? '',
    children: c.children ?? '',
    pets: c.pets ?? '',
    activeDevices: c.activeDevices ?? '',
    wonCustomersCount: String(c.wonCustomersCount ?? 0),
    cadenceDays: c.cadenceDays ? String(c.cadenceDays) : '',
  }
}

export function StammdatenCard({
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
  onSave: (patch: ContactPatch) => Promise<void>
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
        team: draft.team.trim() || undefined,
        email: draft.email.trim() || undefined,
        birthday: draft.birthday || undefined,
        location: draft.location.trim() || undefined,
        familyStatus: draft.familyStatus.trim() || undefined,
        children: draft.children.trim() || undefined,
        pets: draft.pets.trim() || undefined,
        activeDevices: draft.activeDevices.trim() || undefined,
        wonCustomersCount: Number(draft.wonCustomersCount) || 0,
        cadenceDays: draft.cadenceDays ? Number(draft.cadenceDays) : undefined,
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
              <EditField label="Team">
                <Input value={draft.team} onChange={(e) => set('team', e.target.value)} />
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
              <EditField label="Kontakt-Rhythmus">
                <select
                  className={selectCls}
                  value={draft.cadenceDays}
                  onChange={(e) => set('cadenceDays', e.target.value)}
                >
                  {CADENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
            <FieldRow icon={Briefcase} label="Team">
              {contact.team || '—'}
            </FieldRow>
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
            <FieldRow icon={Repeat} label="Kontakt-Rhythmus">
              {contact.cadenceDays ? `alle ${contact.cadenceDays} Tage` : 'Standard'}
            </FieldRow>
          </>
        )}
      </CardContent>
    </Card>
  )
}
