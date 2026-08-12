import { useMemo, useState } from 'react'
import { AtSign, Briefcase, Building, Building2, Cake, Heart, Home, Link2, Mail, MapPin, PawPrint, Phone, PhoneCall, Plus, Repeat, Smartphone, Trophy, UserRound, Users, X } from 'lucide-react'
import type { AppUser, BuyingRole, Contact, Region, SocialLink } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'
import { ROLE_LABEL } from '@/domain/roles'
import { BUYING_ROLE_OPTIONS } from '@/domain/buyingCenter'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { formatDate, daysUntilBirthday } from '@/lib/format'
import { EditButton, EditField, FieldRow, selectCls, telHref } from './shared'

interface StammDraft {
  fullName: string
  position: string
  regionId: string
  relationshipManagerId: string
  company: string
  team: string
  email: string
  phoneWork: string
  phoneMobile: string
  phonePrivate: string
  phoneDirect: string
  emailPrivate: string
  businessAddress: string
  assistantName: string
  assistantContact: string
  socialLinks: SocialLink[]
  birthday: string
  location: string
  familyStatus: string
  children: string
  pets: string
  activeDevices: string
  wonCustomersCount: string
  cadenceDays: string
  buyingRole: string
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
    company: c.company ?? '',
    team: c.team ?? '',
    email: c.email ?? '',
    phoneWork: c.phoneWork ?? '',
    phoneMobile: c.phoneMobile ?? '',
    phonePrivate: c.phonePrivate ?? '',
    phoneDirect: c.phoneDirect ?? '',
    emailPrivate: c.emailPrivate ?? '',
    businessAddress: c.businessAddress ?? '',
    assistantName: c.assistantName ?? '',
    assistantContact: c.assistantContact ?? '',
    socialLinks: c.socialLinks ?? [],
    birthday: c.birthday ?? '',
    location: c.location ?? '',
    familyStatus: c.familyStatus ?? '',
    children: c.children ?? '',
    pets: c.pets ?? '',
    activeDevices: c.activeDevices ?? '',
    wonCustomersCount: String(c.wonCustomersCount ?? 0),
    cadenceDays: c.cadenceDays ? String(c.cadenceDays) : '',
    buyingRole: c.buyingRole ?? '',
  }
}

export function StammdatenCard({
  contact,
  canEdit,
  canSensitive,
  regions,
  users,
  onSave,
  onCreateRegion,
}: {
  contact: Contact
  canEdit: boolean
  canSensitive: boolean
  regions: Region[]
  users: AppUser[]
  onSave: (patch: ContactPatch) => Promise<void>
  /**
   * Optional: eine Region direkt beim Bearbeiten anlegen (nur RM+, weil das
   * Bearbeiten selbst schon canApprove verlangt). Gibt die neue Region zurück,
   * die sofort auswählbar wird. Wird von ContactProfile bereitgestellt.
   */
  onCreateRegion?: (name: string) => Promise<Region>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<StammDraft>(() => toStammDraft(contact))
  const [saving, setSaving] = useState(false)
  const bdayDays = canSensitive ? daysUntilBirthday(contact.birthday) : null

  // Frisch angelegte Regionen sofort auswählbar machen, auch bevor die
  // Elternabfrage (ContactProfile) die aktualisierte Liste nachgeliefert hat.
  // Sobald sie in `regions` auftaucht, greift die Entdopplung.
  const [createdRegions, setCreatedRegions] = useState<Region[]>([])
  const [showNewRegion, setShowNewRegion] = useState(false)
  const [newRegionName, setNewRegionName] = useState('')
  const [creatingRegion, setCreatingRegion] = useState(false)

  const regionOptions = useMemo(() => {
    const known = new Set(regions.map((r) => r.id))
    return [...regions, ...createdRegions.filter((r) => !known.has(r.id))]
  }, [regions, createdRegions])

  const set = <K extends keyof StammDraft,>(k: K, v: StammDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  const createRegion = async () => {
    if (!onCreateRegion) return
    const name = newRegionName.trim()
    if (!name) return
    setCreatingRegion(true)
    try {
      const created = await onCreateRegion(name)
      setCreatedRegions((prev) => [...prev, created])
      set('regionId', created.id)
      setNewRegionName('')
      setShowNewRegion(false)
    } catch {
      // Fehler meldet der Aufrufer (ContactProfile) als Toast; Eingabe bleibt stehen.
    } finally {
      setCreatingRegion(false)
    }
  }

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
        company: draft.company.trim() || undefined,
        team: draft.team.trim() || undefined,
        email: draft.email.trim() || undefined,
        phoneWork: draft.phoneWork.trim() || undefined,
        phoneMobile: draft.phoneMobile.trim() || undefined,
        phonePrivate: draft.phonePrivate.trim() || undefined,
        phoneDirect: draft.phoneDirect.trim() || undefined,
        emailPrivate: draft.emailPrivate.trim() || undefined,
        businessAddress: draft.businessAddress.trim() || undefined,
        assistantName: draft.assistantName.trim() || undefined,
        assistantContact: draft.assistantContact.trim() || undefined,
        socialLinks: draft.socialLinks
          .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
          .filter((l) => l.url.length > 0),
        birthday: draft.birthday || undefined,
        location: draft.location.trim() || undefined,
        familyStatus: draft.familyStatus.trim() || undefined,
        children: draft.children.trim() || undefined,
        pets: draft.pets.trim() || undefined,
        activeDevices: draft.activeDevices.trim() || undefined,
        wonCustomersCount: Number(draft.wonCustomersCount) || 0,
        cadenceDays: draft.cadenceDays ? Number(draft.cadenceDays) : undefined,
        buyingRole: (draft.buyingRole || undefined) as BuyingRole | undefined,
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
                  {regionOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.isPlaceholder ? ' (Platzhalter)' : ''}
                    </option>
                  ))}
                </select>
                {onCreateRegion &&
                  (showNewRegion ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <Input
                        value={newRegionName}
                        onChange={(e) => setNewRegionName(e.target.value)}
                        placeholder="Name der neuen Region"
                        aria-label="Name der neuen Region"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void createRegion()
                          }
                        }}
                        autoFocus
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={createRegion}
                        disabled={creatingRegion || !newRegionName.trim()}
                      >
                        {creatingRegion ? 'Anlegen…' : 'Anlegen'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowNewRegion(false)
                          setNewRegionName('')
                        }}
                      >
                        Abbrechen
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNewRegion(true)}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="size-3.5" /> Neue Region
                    </button>
                  ))}
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
              <EditField label="Firma">
                <Input value={draft.company} onChange={(e) => set('company', e.target.value)} />
              </EditField>
              <EditField label="Team">
                <Input value={draft.team} onChange={(e) => set('team', e.target.value)} />
              </EditField>
              <EditField label="E-Mail">
                <Input type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} />
              </EditField>
              <EditField label="Telefon (dienstlich)">
                <Input
                  type="tel"
                  value={draft.phoneWork}
                  onChange={(e) => set('phoneWork', e.target.value)}
                  placeholder="+49 30 000000-0"
                />
              </EditField>
              <EditField label="Mobil (dienstlich)">
                <Input
                  type="tel"
                  value={draft.phoneMobile}
                  onChange={(e) => set('phoneMobile', e.target.value)}
                  placeholder="+49 170 0000000"
                />
              </EditField>
              <EditField label="Durchwahl / 2. Nummer">
                <Input
                  type="tel"
                  value={draft.phoneDirect}
                  onChange={(e) => set('phoneDirect', e.target.value)}
                  placeholder="+49 30 000000-123"
                />
              </EditField>
              <EditField label="Telefon (privat)">
                <Input
                  type="tel"
                  value={draft.phonePrivate}
                  onChange={(e) => set('phonePrivate', e.target.value)}
                  placeholder="nur mit Einverständnis"
                />
              </EditField>
              <EditField label="E-Mail (privat)">
                <Input
                  type="email"
                  value={draft.emailPrivate}
                  onChange={(e) => set('emailPrivate', e.target.value)}
                  placeholder="nur mit Einverständnis"
                />
              </EditField>
              <EditField label="Dienstanschrift">
                <Input
                  value={draft.businessAddress}
                  onChange={(e) => set('businessAddress', e.target.value)}
                  placeholder="Straße, PLZ Ort"
                />
              </EditField>
              <EditField label="Assistenz (Name)">
                <Input
                  value={draft.assistantName}
                  onChange={(e) => set('assistantName', e.target.value)}
                />
              </EditField>
              <EditField label="Assistenz (Kontakt)">
                <Input
                  value={draft.assistantContact}
                  onChange={(e) => set('assistantContact', e.target.value)}
                  placeholder="Telefon oder E-Mail"
                />
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
              <EditField label="Rolle im Buying Center">
                <select
                  className={selectCls}
                  value={draft.buyingRole}
                  onChange={(e) => set('buyingRole', e.target.value)}
                >
                  {BUYING_ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Social-Media-Links</Label>
                <button
                  type="button"
                  onClick={() => set('socialLinks', [...draft.socialLinks, { label: '', url: '' }])}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-3.5" /> Link
                </button>
              </div>
              {draft.socialLinks.length === 0 ? (
                <p className="text-xs text-muted-foreground">Noch keine Links.</p>
              ) : (
                draft.socialLinks.map((link, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      className="w-28 shrink-0"
                      value={link.label}
                      onChange={(e) =>
                        set(
                          'socialLinks',
                          draft.socialLinks.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)),
                        )
                      }
                      placeholder="Label"
                    />
                    <Input
                      value={link.url}
                      onChange={(e) =>
                        set(
                          'socialLinks',
                          draft.socialLinks.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)),
                        )
                      }
                      placeholder="https://…"
                    />
                    <button
                      type="button"
                      onClick={() => set('socialLinks', draft.socialLinks.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Link entfernen"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))
              )}
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
            <FieldRow icon={Building2} label="Firma">
              {contact.company || '—'}
            </FieldRow>
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
            <FieldRow icon={Phone} label="Telefon (dienstlich)">
              {contact.phoneWork ? (
                <a href={telHref(contact.phoneWork)} className="text-primary hover:underline">
                  {contact.phoneWork}
                </a>
              ) : (
                '—'
              )}
            </FieldRow>
            <FieldRow icon={Smartphone} label="Mobil (dienstlich)">
              {contact.phoneMobile ? (
                <a href={telHref(contact.phoneMobile)} className="text-primary hover:underline">
                  {contact.phoneMobile}
                </a>
              ) : (
                '—'
              )}
            </FieldRow>
            <FieldRow icon={PhoneCall} label="Durchwahl / 2. Nummer">
              {contact.phoneDirect ? (
                <a href={telHref(contact.phoneDirect)} className="text-primary hover:underline">
                  {contact.phoneDirect}
                </a>
              ) : (
                '—'
              )}
            </FieldRow>
            {/* Privatsphäre: gleiche Stufe wie Geburtstag, für Account Manager gesperrt. */}
            <FieldRow icon={Home} label="Telefon (privat)" locked={!canSensitive}>
              {contact.phonePrivate ? (
                <a href={telHref(contact.phonePrivate)} className="text-primary hover:underline">
                  {contact.phonePrivate}
                </a>
              ) : (
                '—'
              )}
            </FieldRow>
            {/* Private E-Mail: sensibel wie die private Nummer. */}
            <FieldRow icon={AtSign} label="E-Mail (privat)" locked={!canSensitive}>
              {contact.emailPrivate ? (
                <a href={`mailto:${contact.emailPrivate}`} className="text-primary hover:underline">
                  {contact.emailPrivate}
                </a>
              ) : (
                '—'
              )}
            </FieldRow>
            <FieldRow icon={Building} label="Dienstanschrift">
              {contact.businessAddress || '—'}
            </FieldRow>
            <FieldRow icon={UserRound} label="Assistenz">
              {contact.assistantName || contact.assistantContact
                ? [contact.assistantName, contact.assistantContact].filter(Boolean).join(' · ')
                : '—'}
            </FieldRow>
            <FieldRow icon={Link2} label="Social Media">
              {contact.socialLinks && contact.socialLinks.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  {contact.socialLinks.map((l, i) => (
                    <a
                      key={i}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {l.label || l.url}
                    </a>
                  ))}
                </div>
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
