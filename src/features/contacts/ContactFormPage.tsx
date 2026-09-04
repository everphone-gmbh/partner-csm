import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, X } from 'lucide-react'
import type { AppUser, Contact, LinkedInInfo, LinkedInStatus, Region, SideFact } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { canApprove, ROLE_LABEL } from '@/domain/roles'
import { buildLinkedInInfo } from '@/domain/linkedin'
import { useRepoQuery } from '@/app/useRepoQuery'
import { useUnsavedChangesGuard } from '@/app/useUnsavedChangesGuard'
import { QueryError } from '@/components/QueryError'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { LinkedInPicker } from '@/components/LinkedInField'
import { useFieldSuggestions } from './useFieldSuggestions'
import { SuggestionDatalist } from './SuggestionDatalist'

interface FormState {
  fullName: string
  position: string
  regionId: string
  relationshipManagerId: string
  company: string
  team: string
  email: string
  phoneWork: string
  phoneMobile: string
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
  company: '',
  team: '',
  email: '',
  phoneWork: '',
  phoneMobile: '',
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
    company: c.company ?? '',
    team: c.team ?? '',
    email: c.email ?? '',
    phoneWork: c.phoneWork ?? '',
    phoneMobile: c.phoneMobile ?? '',
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

/** Feldweiser Vergleich — Grundlage für „ungespeicherte Änderungen“. */
function sameForm(a: FormState, b: FormState): boolean {
  return (Object.keys(a) as (keyof FormState)[]).every((key) =>
    key === 'sideFacts'
      ? JSON.stringify(a.sideFacts) === JSON.stringify(b.sideFacts)
      : a[key] === b[key],
  )
}

const selectCls =
  'h-10 w-full rounded-[10px] border border-transparent bg-secondary px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function ContactFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useSession()
  const { toast } = useToast()
  const allowed = canApprove(user.role)
  const suggestions = useFieldSuggestions()
  const formId = useId()
  const fid = (name: keyof FormState) => `${formId}-${name}`
  const teamListId = `${formId}-teams`
  const companyListId = `${formId}-companies`
  const nameRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>(EMPTY)
  // Stand nach dem Laden bzw. nach dem letzten Speichern — die Vergleichsbasis
  // für den Wächter gegen Datenverlust (Feedback #1).
  const [initial, setInitial] = useState<FormState>(EMPTY)
  // LinkedIn state as loaded — needed so an unrelated edit doesn't re-stamp
  // the verifier attribution (who checked the account, and when).
  const [loadedLinkedin, setLoadedLinkedin] = useState<LinkedInInfo | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [newFact, setNewFact] = useState('')

  const { data, loading, error, retry } = useRepoQuery(
    () =>
      Promise.all([
        repository.listRegions(),
        repository.listUsers(),
        id ? repository.getContact(id) : Promise.resolve(undefined),
      ]),
    [id],
  )
  const regions: Region[] = data?.[0] ?? []
  const users: AppUser[] = data?.[1] ?? []
  useEffect(() => {
    if (!data) return
    const [r, u, c] = data
    if (c) {
      const loaded = fromContact(c)
      setForm(loaded)
      setInitial(loaded)
      setLoadedLinkedin(c.linkedin)
    } else {
      const defaults = { regionId: r[0]?.id ?? '', relationshipManagerId: u[0]?.id ?? '' }
      setForm((f) => ({ ...f, ...defaults }))
      setInitial((f) => ({ ...f, ...defaults }))
    }
  }, [data])

  const canSave = form.fullName.trim().length > 0
  // Während des Speicherns nicht „dirty“: sonst würde die Navigation direkt nach
  // dem erfolgreichen Speichern noch einmal abgefangen.
  const isDirty = !saving && !sameForm(form, initial)

  const set = <K extends keyof FormState,>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const addFact = () => {
    const label = newFact.trim()
    if (!label) return
    set('sideFacts', [
      ...form.sideFacts,
      { id: crypto.randomUUID(), label, category: 'other' },
    ])
    setNewFact('')
  }

  const removeFact = (factId: string) =>
    set('sideFacts', form.sideFacts.filter((f) => f.id !== factId))

  const buildLinkedin = (): LinkedInInfo =>
    buildLinkedInInfo(
      form.linkedinStatus,
      form.linkedinUrl,
      loadedLinkedin,
      { id: user.id, name: user.name },
      new Date().toISOString().slice(0, 10),
    )

  /**
   * Schreibt das Formular weg (anlegen oder ändern) und liefert den gespeicherten
   * Kontakt. Bei einem Fehler `undefined`: der ist dann schon als Toast gemeldet,
   * und die Eingaben bleiben für einen neuen Versuch stehen.
   */
  const persist = async (): Promise<Contact | undefined> => {
    if (!canSave || saving) return undefined
    setSaving(true)
    const payload = {
      fullName: form.fullName.trim(),
      position: form.position.trim(),
      regionId: form.regionId,
      relationshipManagerId: form.relationshipManagerId,
      company: form.company.trim() || undefined,
      team: form.team.trim() || undefined,
      email: form.email.trim() || undefined,
      phoneWork: form.phoneWork.trim() || undefined,
      phoneMobile: form.phoneMobile.trim() || undefined,
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
      const saved =
        isEdit && id
          ? await repository.updateContact(id, payload)
          : await repository.createContact(payload)
      // Gespeichert ist genau dieser Stand — was danach getippt wird, zählt wieder.
      setInitial(form)
      return saved
    } catch (err) {
      toast(saveErrorMessage(err)) // form state stays intact for a retry
      return undefined
    } finally {
      setSaving(false)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const saved = await persist()
    if (saved) navigate(`/contacts/${saved.id}`)
  }

  // „Speichern & weiteren anlegen“ (Feedback #4): speichert, meldet den Erfolg,
  // leert das Formular und bleibt auf der Seite. Region und Relationship Manager
  // bleiben stehen — wer mehrere Kontakte derselben Region erfasst, spart so je
  // zwei Klicks.
  const saveAndNew = async () => {
    const saved = await persist()
    if (!saved) return
    toast(`Kontakt „${saved.fullName}“ angelegt.`, 'success')
    const next: FormState = {
      ...EMPTY,
      regionId: form.regionId,
      relationshipManagerId: form.relationshipManagerId,
    }
    setForm(next)
    setInitial(next)
    setLoadedLinkedin(undefined)
    setNewFact('')
    nameRef.current?.focus()
  }

  const { dialog } = useUnsavedChangesGuard({
    isDirty,
    canSave,
    onSave: async () => Boolean(await persist()),
  })

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

  if (error) return <QueryError error={error} retry={retry} />
  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>

  const cancelTo = isEdit && id ? `/contacts/${id}` : '/contacts'

  return (
    <>
      <form onSubmit={submit} className="space-y-4">
        <Link
          to={cancelTo}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Abbrechen
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">{isEdit ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basis</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name *" htmlFor={fid('fullName')}>
              <Input
                id={fid('fullName')}
                ref={nameRef}
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
                required
              />
            </Field>
            <Field label="Funktion" htmlFor={fid('position')}>
              <Input id={fid('position')} value={form.position} onChange={(e) => set('position', e.target.value)} />
            </Field>
            <Field label="Region" htmlFor={fid('regionId')}>
              <select
                id={fid('regionId')}
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
            <Field label="Relationship Manager" htmlFor={fid('relationshipManagerId')}>
              <select
                id={fid('relationshipManagerId')}
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
            {/* Firma/Team: Freitext mit Vorschlägen aus Kontakten + Soll-Struktur (Feedback #2/#3). */}
            <Field label="Firma" htmlFor={fid('company')}>
              <Input
                id={fid('company')}
                list={companyListId}
                value={form.company}
                onChange={(e) => set('company', e.target.value)}
                placeholder="z. B. Deutsche Telekom"
              />
              <SuggestionDatalist id={companyListId} options={suggestions.companies} />
            </Field>
            <Field label="Team" htmlFor={fid('team')}>
              <Input
                id={fid('team')}
                list={teamListId}
                value={form.team}
                onChange={(e) => set('team', e.target.value)}
              />
              <SuggestionDatalist id={teamListId} options={suggestions.teams} />
            </Field>
            <Field label="Telefon (dienstlich)" htmlFor={fid('phoneWork')}>
              <Input
                id={fid('phoneWork')}
                type="tel"
                value={form.phoneWork}
                onChange={(e) => set('phoneWork', e.target.value)}
                placeholder="+49 30 000000-0"
              />
            </Field>
            <Field label="Mobil (dienstlich)" htmlFor={fid('phoneMobile')}>
              <Input
                id={fid('phoneMobile')}
                type="tel"
                value={form.phoneMobile}
                onChange={(e) => set('phoneMobile', e.target.value)}
                placeholder="+49 170 0000000"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kontakt & Persönliches</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="E-Mail" htmlFor={fid('email')}>
              <Input id={fid('email')} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Geburtstag" htmlFor={fid('birthday')}>
              <Input id={fid('birthday')} type="date" value={form.birthday} onChange={(e) => set('birthday', e.target.value)} />
            </Field>
            <Field label="Wohnort" htmlFor={fid('location')}>
              <Input id={fid('location')} value={form.location} onChange={(e) => set('location', e.target.value)} />
            </Field>
            <Field label="Familienstand" htmlFor={fid('familyStatus')}>
              <Input id={fid('familyStatus')} value={form.familyStatus} onChange={(e) => set('familyStatus', e.target.value)} />
            </Field>
            <Field label="Kinder" htmlFor={fid('children')}>
              <Input id={fid('children')} value={form.children} onChange={(e) => set('children', e.target.value)} />
            </Field>
            <Field label="Haustiere" htmlFor={fid('pets')}>
              <Input id={fid('pets')} value={form.pets} onChange={(e) => set('pets', e.target.value)} />
            </Field>
            <Field label="Active Devices" htmlFor={fid('activeDevices')}>
              <Input id={fid('activeDevices')} value={form.activeDevices} onChange={(e) => set('activeDevices', e.target.value)} />
            </Field>
            <Field label="Gewonnene Kunden" htmlFor={fid('wonCustomersCount')}>
              <Input
                id={fid('wonCustomersCount')}
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
              <Field label="Profil-URL" htmlFor={fid('linkedinUrl')}>
                <Input
                  id={fid('linkedinUrl')}
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
                aria-label="Neuer Anknüpfungspunkt"
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
            <Textarea
              value={form.freeText}
              onChange={(e) => set('freeText', e.target.value)}
              rows={3}
              aria-label="Notiz"
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link to={cancelTo} className="text-sm text-muted-foreground hover:text-foreground">
            Abbrechen
          </Link>
          {!isEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void saveAndNew()}
              disabled={!canSave || saving}
            >
              Speichern & weiteren anlegen
            </Button>
          )}
          <Button type="submit" disabled={!canSave || saving}>
            {saving ? 'Speichern…' : isEdit ? 'Änderungen speichern' : 'Kontakt anlegen'}
          </Button>
        </div>
      </form>
      {dialog}
    </>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
