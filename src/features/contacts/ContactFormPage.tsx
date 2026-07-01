import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, X } from 'lucide-react'
import type { AppUser, Contact, LinkedInInfo, LinkedInStatus, Region, SideFact } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { canApprove, ROLE_LABEL } from '@/domain/roles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { LinkedInPicker } from '@/components/LinkedInField'

interface FormState {
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
  freeText: string
  linkedinStatus: LinkedInStatus
  linkedinUrl: string
  sideFacts: SideFact[]
}

const EMPTY: FormState = {
  fullName: '',
  position: '',
  regionId: '',
  relationshipManagerId: '',
  team: '',
  email: '',
  birthday: '',
  location: '',
  familyStatus: '',
  children: '',
  pets: '',
  activeDevices: '',
  wonCustomersCount: '0',
  freeText: '',
  linkedinStatus: 'unknown',
  linkedinUrl: '',
  sideFacts: [],
}

function fromContact(c: Contact): FormState {
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
    freeText: c.freeText ?? '',
    linkedinStatus: c.linkedin.status,
    linkedinUrl: c.linkedin.url ?? '',
    sideFacts: c.sideFacts,
  }
}

const selectCls =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function ContactFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useSession()
  const allowed = canApprove(user.role)

  const [form, setForm] = useState<FormState>(EMPTY)
  const [regions, setRegions] = useState<Region[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newFact, setNewFact] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      repository.listRegions(),
      repository.listUsers(),
      id ? repository.getContact(id) : Promise.resolve(undefined),
    ]).then(([r, u, c]) => {
      if (!active) return
      setRegions(r)
      setUsers(u)
      if (c) setForm(fromContact(c))
      else setForm((f) => ({ ...f, regionId: r[0]?.id ?? '', relationshipManagerId: u[0]?.id ?? '' }))
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

  const set = <K extends keyof FormState,>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const addFact = () => {
    const label = newFact.trim()
    if (!label) return
    set('sideFacts', [
      ...form.sideFacts,
      { id: `sf-local-${form.sideFacts.length}-${label}`, label, category: 'other' },
    ])
    setNewFact('')
  }

  const removeFact = (factId: string) =>
    set('sideFacts', form.sideFacts.filter((f) => f.id !== factId))

  const buildLinkedin = (): LinkedInInfo => {
    const info: LinkedInInfo = { status: form.linkedinStatus }
    if (form.linkedinStatus === 'has_account' && form.linkedinUrl.trim()) {
      info.url = form.linkedinUrl.trim()
    }
    if (form.linkedinStatus !== 'unknown') {
      info.verifiedByName = user.name
      info.verifiedAt = new Date().toISOString().slice(0, 10)
    }
    return info
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.fullName.trim() || saving) return
    setSaving(true)
    const payload = {
      fullName: form.fullName.trim(),
      position: form.position.trim(),
      regionId: form.regionId,
      relationshipManagerId: form.relationshipManagerId,
      team: form.team.trim() || undefined,
      email: form.email.trim() || undefined,
      birthday: form.birthday || undefined,
      location: form.location.trim() || undefined,
      familyStatus: form.familyStatus.trim() || undefined,
      children: form.children.trim() || undefined,
      pets: form.pets.trim() || undefined,
      activeDevices: form.activeDevices.trim() || undefined,
      wonCustomersCount: Number(form.wonCustomersCount) || 0,
      freeText: form.freeText.trim() || undefined,
      linkedin: buildLinkedin(),
      sideFacts: form.sideFacts,
    }
    try {
      if (isEdit && id) {
        await repository.updateContact(id, payload)
        navigate(`/contacts/${id}`)
      } else {
        const created = await repository.createContact(payload)
        navigate(`/contacts/${created.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!allowed) {
    return (
      <div className="space-y-3">
        <Link to="/contacts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Alle Kontakte
        </Link>
        <p className="text-sm text-muted-foreground">
          Für Ihre Rolle ist das Bearbeiten von Kontakten nicht freigegeben.
        </p>
      </div>
    )
  }

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>

  return (
    <form onSubmit={submit} className="space-y-4">
      <Link
        to={isEdit && id ? `/contacts/${id}` : '/contacts'}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Abbrechen
      </Link>

      <h1 className="text-xl font-semibold">{isEdit ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basis</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name *">
            <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} required />
          </Field>
          <Field label="Funktion">
            <Input value={form.position} onChange={(e) => set('position', e.target.value)} />
          </Field>
          <Field label="Region">
            <select
              className={selectCls}
              value={form.regionId}
              onChange={(e) => set('regionId', e.target.value)}
            >
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Relationship Manager">
            <select
              className={selectCls}
              value={form.relationshipManagerId}
              onChange={(e) => set('relationshipManagerId', e.target.value)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {ROLE_LABEL[u.role]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Team">
            <Input value={form.team} onChange={(e) => set('team', e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kontakt & Persönliches</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="E-Mail">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Geburtstag">
            <Input type="date" value={form.birthday} onChange={(e) => set('birthday', e.target.value)} />
          </Field>
          <Field label="Wohnort">
            <Input value={form.location} onChange={(e) => set('location', e.target.value)} />
          </Field>
          <Field label="Familienstand">
            <Input value={form.familyStatus} onChange={(e) => set('familyStatus', e.target.value)} />
          </Field>
          <Field label="Kinder">
            <Input value={form.children} onChange={(e) => set('children', e.target.value)} />
          </Field>
          <Field label="Haustiere">
            <Input value={form.pets} onChange={(e) => set('pets', e.target.value)} />
          </Field>
          <Field label="Active Devices">
            <Input value={form.activeDevices} onChange={(e) => set('activeDevices', e.target.value)} />
          </Field>
          <Field label="Gewonnene Kunden">
            <Input
              type="number"
              min={0}
              value={form.wonCustomersCount}
              onChange={(e) => set('wonCustomersCount', e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">LinkedIn</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <LinkedInPicker status={form.linkedinStatus} onChange={(s) => set('linkedinStatus', s)} />
          {form.linkedinStatus === 'has_account' && (
            <Field label="Profil-URL">
              <Input
                type="url"
                placeholder="https://www.linkedin.com/in/…"
                value={form.linkedinUrl}
                onChange={(e) => set('linkedinUrl', e.target.value)}
              />
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Anknüpfungspunkte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.sideFacts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.sideFacts.map((f) => (
                <Badge key={f.id} variant="accent" className="gap-1">
                  {f.label}
                  <button
                    type="button"
                    onClick={() => removeFact(f.id)}
                    aria-label={`${f.label} entfernen`}
                    className="rounded-full hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addFact()
                }
              }}
              placeholder="z. B. Segeln"
            />
            <Button type="button" variant="outline" onClick={addFact}>
              <Plus className="size-4" /> Hinzufügen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notiz</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={form.freeText} onChange={(e) => set('freeText', e.target.value)} rows={3} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link
          to={isEdit && id ? `/contacts/${id}` : '/contacts'}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Abbrechen
        </Link>
        <Button type="submit" disabled={!form.fullName.trim() || saving}>
          {saving ? 'Speichern…' : isEdit ? 'Änderungen speichern' : 'Kontakt anlegen'}
        </Button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
