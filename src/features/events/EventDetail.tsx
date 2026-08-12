import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, BellPlus, CalendarDays, ClipboardList, Clock, MapPin, Plus, Trash2, UserCheck, UserPlus } from 'lucide-react'
import type { AppUser, AttendanceStatus, Contact, EventAttendee, EventGuest, Region } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { canApprove } from '@/domain/roles'
import { buttonVariants } from '@/components/ui/button'
import { buildFollowUpReminders } from './followUps'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/format'
import { ATTENDANCE_LABEL, ATTENDANCE_ORDER, ATTENDANCE_VARIANT } from './eventMeta'
import { EventNotes } from './EventNotes'
import {
  bySlotFirst,
  conflictingContactIds,
  DEFAULT_SLOT_MINUTES,
  eventDays,
  inputsToSlot,
  isMultiDay,
  slotToInputs,
} from './eventScheduling'

const selectCls =
  'h-9 rounded-[10px] border border-transparent bg-secondary px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function EventDetail() {
  const { id } = useParams()
  const { user } = useSession()
  const { toast } = useToast()
  const [attendees, setAttendees] = useState<EventAttendee[]>([])
  const [guests, setGuests] = useState<EventGuest[]>([])
  const [addId, setAddId] = useState('')
  const [generatingFollowUps, setGeneratingFollowUps] = useState(false)

  const { data, loading, error, retry } = useRepoQuery(
    () =>
      Promise.all([
        repository.getEvent(id ?? ''),
        repository.listEventAttendees(id ?? ''),
        repository.listContacts(),
        repository.listRegions(),
        repository.listUsers(),
        repository.listEventGuests(id ?? ''),
      ]),
    [id],
  )
  const event = data?.[0]
  const contacts: Contact[] = data?.[2] ?? []
  const regions = data?.[3] ?? []
  const users = data?.[4] ?? []
  useEffect(() => {
    setAttendees(data?.[1] ?? [])
    setGuests(data?.[5] ?? [])
  }, [data])

  const loadAttendees = () => {
    if (id)
      void repository
        .listEventAttendees(id)
        .then(setAttendees)
        .catch((err: unknown) => toast(saveErrorMessage(err)))
  }
  const loadGuests = () => {
    if (id)
      void repository
        .listEventGuests(id)
        .then(setGuests)
        .catch((err: unknown) => toast(saveErrorMessage(err)))
  }

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts])
  const counts = useMemo(() => {
    const m: Record<AttendanceStatus, number> = {
      invited: 0,
      accepted: 0,
      declined: 0,
      attended: 0,
      no_show: 0,
    }
    attendees.forEach((a) => {
      m[a.status]++
    })
    return m
  }, [attendees])
  // Agenda-Reihenfolge: terminierte Gespräche chronologisch nach vorne,
  // der Rest danach nach Status — vor Ort zählt „was kommt als Nächstes".
  const sorted = useMemo(
    () =>
      [...attendees].sort(
        (a, b) =>
          bySlotFirst(a, b) ||
          ATTENDANCE_ORDER.indexOf(a.status) - ATTENDANCE_ORDER.indexOf(b.status),
      ),
    [attendees],
  )
  const conflicts = useMemo(() => conflictingContactIds(attendees), [attendees])
  // Stabile Identität: eventDays() liefert sonst bei jedem Rendern ein neues
  // Array und lässt Effekte in SlotEditor unnötig feuern.
  const days = useMemo(
    () => (event ? eventDays(event) : []),
    [event?.date, event?.endDate],
  )
  const slotCount = attendees.filter((a) => a.slotAt).length
  const notAttending = contacts.filter((c) => !attendees.some((a) => a.contactId === c.id))

  const setStatus = async (contactId: string, status: AttendanceStatus) => {
    const before = attendees
    setAttendees((prev) => prev.map((a) => (a.contactId === contactId ? { ...a, status } : a)))
    try {
      if (id) await repository.setAttendee(id, contactId, { status })
    } catch (err) {
      setAttendees(before) // roll the optimistic update back
      toast(saveErrorMessage(err))
    }
  }
  const editPurpose = (contactId: string, purpose: string) =>
    setAttendees((prev) => prev.map((a) => (a.contactId === contactId ? { ...a, purpose } : a)))
  const savePurpose = async (contactId: string, purpose: string) => {
    try {
      if (id) await repository.setAttendee(id, contactId, { purpose })
    } catch (err) {
      toast(saveErrorMessage(err))
      loadAttendees() // resync with what the server actually has
    }
  }
  /** Termin, Dauer und Treffpunkt eines Teilnehmers sichern (optimistisch). */
  const saveSlot = async (
    contactId: string,
    patch: { slotAt?: string | null; slotMinutes?: number | null; meetingPoint?: string | null },
  ) => {
    const before = attendees
    setAttendees((prev) =>
      prev.map((a) =>
        a.contactId === contactId
          ? {
              ...a,
              ...(patch.slotAt !== undefined ? { slotAt: patch.slotAt ?? undefined } : {}),
              ...(patch.slotAt === null ? { slotMinutes: undefined } : {}),
              ...(patch.slotMinutes !== undefined
                ? { slotMinutes: patch.slotMinutes ?? undefined }
                : {}),
              ...(patch.meetingPoint !== undefined
                ? { meetingPoint: patch.meetingPoint ?? undefined }
                : {}),
            }
          : a,
      ),
    )
    try {
      if (id) await repository.setAttendee(id, contactId, patch)
    } catch (err) {
      setAttendees(before)
      toast(saveErrorMessage(err))
    }
  }

  const removeAttendee = async (contactId: string) => {
    if (!id) return
    try {
      await repository.removeAttendee(id, contactId)
    } catch (err) {
      toast(saveErrorMessage(err))
      return
    }
    loadAttendees()
  }
  const addAttendee = async () => {
    if (!id || !addId) return
    try {
      await repository.setAttendee(id, addId, { status: 'invited' })
    } catch (err) {
      toast(saveErrorMessage(err))
      return
    }
    setAddId('')
    loadAttendees()
  }

  // --- Gäste: unbekannte Personen am Stand, später zu echten Kontakten befördert ---
  const addGuest = async (input: { name: string; company: string; note: string }) => {
    if (!id) return
    const name = input.name.trim()
    if (!name) return
    try {
      await repository.addEventGuest({
        eventId: id,
        name,
        company: input.company.trim() || undefined,
        note: input.note.trim() || undefined,
      })
    } catch (err) {
      toast(saveErrorMessage(err))
      return
    }
    loadGuests()
  }
  const removeGuest = async (guestId: string) => {
    if (!window.confirm('Diesen Gast entfernen? Notizen über ihn werden mit gelöscht.')) return
    try {
      await repository.removeEventGuest(guestId)
    } catch (err) {
      toast(saveErrorMessage(err))
      return
    }
    loadGuests()
  }
  const promoteGuest = async (guestId: string, regionId: string, relationshipManagerId: string) => {
    try {
      await repository.promoteGuestToContact(guestId, { regionId, relationshipManagerId })
    } catch (err) {
      toast(saveErrorMessage(err))
      return
    }
    loadGuests()
  }

  // Ein Klick nach dem Event: Follow-up-Reminder für alle Getroffenen.
  // Dedupe über buildFollowUpReminders — der Button ist gefahrlos mehrfach klickbar.
  const generateFollowUps = async () => {
    if (!event) return
    setGeneratingFollowUps(true)
    try {
      const existing = await repository.listReminders()
      const toCreate = buildFollowUpReminders(event, attendees, existing, user.name)
      for (const reminder of toCreate) {
        await repository.addReminder(reminder)
      }
      toast(
        toCreate.length > 0
          ? `${toCreate.length} Follow-up${toCreate.length === 1 ? '' : 's'} erzeugt.`
          : 'Keine neuen Follow-ups nötig — alles schon abgedeckt.',
        'success',
      )
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setGeneratingFollowUps(false)
    }
  }

  if (error) return <QueryError error={error} retry={retry} />
  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>
  if (!event) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="text-sm text-muted-foreground">Event nicht gefunden.</p>
      </div>
    )
  }

  const hasAttended = attendees.some((a) => a.status === 'attended')
  const canEditGuests = canApprove(user.role)
  // Vorgabe für „Zu Kontakt machen": eigene Region, sonst der Platzhalter
  // („Unbekannt") — contacts.region_id ist NOT NULL, es braucht immer ein Ziel.
  const placeholderRegionId = regions.find((r) => r.isPlaceholder)?.id
  const defaultRegionId = user.regionId ?? placeholderRegionId ?? regions[0]?.id ?? ''

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink />
        <div className="flex items-center gap-2">
          {canApprove(user.role) && hasAttended && (
            <button
              type="button"
              onClick={generateFollowUps}
              disabled={generatingFollowUps}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <BellPlus className="size-4" />
              {generatingFollowUps ? 'Erzeuge…' : 'Follow-ups erzeugen'}
            </button>
          )}
          <Link to={`/events/${event.id}/briefing`} className={buttonVariants({ size: 'sm' })}>
            <ClipboardList className="size-4" /> Briefing
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-5 sm:pt-5">
          <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-4" />
              {isMultiDay(event)
                ? `${formatDate(event.date)} – ${formatDate(event.endDate!)}`
                : formatDate(event.date)}
              {isMultiDay(event) && (
                <span className="text-xs">({eventDays(event).length} Tage)</span>
              )}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" />
                {event.location}
              </span>
            )}
          </div>
          {event.description && <p className="text-sm text-foreground">{event.description}</p>}
        </CardContent>
      </Card>

      <EventNotes
        eventId={event.id}
        eventName={event.name}
        attendeeContacts={attendees
          .map((a) => contactById.get(a.contactId))
          .filter((c): c is Contact => Boolean(c))
          .map((c) => ({ id: c.id, fullName: c.fullName }))}
        guests={guests
          .filter((g) => !g.promotedContactId)
          .map((g) => ({ id: g.id, name: g.name }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Briefing</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ATTENDANCE_ORDER.map((s) => (
            <Badge key={s} variant={ATTENDANCE_VARIANT[s]}>
              {ATTENDANCE_LABEL[s]}: {counts[s]}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Teilnehmer</CardTitle>
          {slotCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> {slotCount} Termin{slotCount === 1 ? '' : 'e'} geplant
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {conflicts.size > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-status-amber/40 bg-status-amber/10 px-3 py-2 text-xs text-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-amber" />
              <span>
                {conflicts.size} Termine überschneiden sich zeitlich. Betroffene Gespräche sind
                unten markiert — bitte entzerren, sonst steht jemand am Stand ohne Ansprechpartner.
              </span>
            </div>
          )}
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Teilnehmer.</p>
          ) : (
            <ul className="space-y-3">
              {sorted.map((a) => {
                const c = contactById.get(a.contactId)
                return (
                  <li key={a.contactId} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <Avatar src={c?.photoUrl} name={c?.fullName ?? '??'} className="size-9" />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/contacts/${a.contactId}`}
                          className="block truncate text-sm font-medium hover:underline"
                        >
                          {c?.fullName ?? a.contactId}
                        </Link>
                        <div className="truncate text-xs text-muted-foreground">{c?.position}</div>
                      </div>
                      <select
                        className={selectCls}
                        value={a.status}
                        onChange={(e) => setStatus(a.contactId, e.target.value as AttendanceStatus)}
                      >
                        {ATTENDANCE_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {ATTENDANCE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeAttendee(a.contactId)}
                        aria-label="Teilnehmer entfernen"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <Input
                      value={a.purpose ?? ''}
                      onChange={(e) => editPurpose(a.contactId, e.target.value)}
                      onBlur={(e) => savePurpose(a.contactId, e.target.value)}
                      placeholder="Wofür? (Ziel / Gesprächsaufhänger)"
                    />
                    <SlotEditor
                      attendee={a}
                      days={days}
                      hasConflict={conflicts.has(a.contactId)}
                      onSave={(patch) => void saveSlot(a.contactId, patch)}
                    />
                  </li>
                )
              })}
            </ul>
          )}

          {notAttending.length > 0 && (
            <div className="flex gap-2 pt-1">
              <select
                className={`${selectCls} flex-1`}
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
              >
                <option value="">Teilnehmer hinzufügen…</option>
                {notAttending.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" onClick={addAttendee} disabled={!addId}>
                <Plus className="size-4" /> Hinzufügen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gäste</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Unbekannte am Stand — mit „Zu Kontakt machen“ werden sie zu echten Kontakten.
          </p>
          {guests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Gäste erfasst.</p>
          ) : (
            <ul className="space-y-2">
              {guests.map((g) => (
                <GuestRow
                  key={g.id}
                  guest={g}
                  regions={regions}
                  users={users}
                  defaultRegionId={defaultRegionId}
                  defaultManagerId={user.id}
                  canEdit={canEditGuests}
                  onPromote={promoteGuest}
                  onRemove={removeGuest}
                />
              ))}
            </ul>
          )}
          {canEditGuests && <AddGuestForm onAdd={addGuest} />}
        </CardContent>
      </Card>
    </div>
  )
}

const DURATIONS = [15, 30, 45, 60, 90, 120]

/**
 * Standtermin eines Teilnehmers: Tag (nur Event-Tage), Uhrzeit, Dauer,
 * Treffpunkt. Der Tag ist eine Auswahl statt eines Datumsfelds — so kann kein
 * Termin außerhalb des Events entstehen.
 */
function SlotEditor({
  attendee,
  days,
  hasConflict,
  onSave,
}: {
  attendee: EventAttendee
  days: string[]
  hasConflict: boolean
  onSave: (patch: {
    slotAt?: string | null
    slotMinutes?: number | null
    meetingPoint?: string | null
  }) => void
}) {
  const current = slotToInputs(attendee.slotAt)
  const [day, setDay] = useState(current.day || days[0] || '')
  const [time, setTime] = useState(current.time)
  const [point, setPoint] = useState(attendee.meetingPoint ?? '')

  // Wenn der Termin von außen wechselt (Neuladen, Rollback), Felder mitziehen.
  // Abhängigkeit ist bewusst der zusammengefügte String, nicht das Array:
  // sonst genügt eine neue Array-Identität, um die Eingabe zurückzusetzen,
  // während der Nutzer gerade tippt.
  const dayKey = days.join('|')
  useEffect(() => {
    const next = slotToInputs(attendee.slotAt)
    setDay(next.day || dayKey.split('|')[0] || '')
    setTime(next.time)
    setPoint(attendee.meetingPoint ?? '')
  }, [attendee.slotAt, attendee.meetingPoint, dayKey])

  const commitSlot = (nextDay: string, nextTime: string) => {
    const slotAt = inputsToSlot(nextDay, nextTime)
    // Zeit gelöscht → Termin aufheben; unvollständig → noch nichts speichern.
    if (!nextTime) {
      if (attendee.slotAt) onSave({ slotAt: null })
      return
    }
    if (!slotAt) return
    if (slotAt === attendee.slotAt) return
    onSave({ slotAt, slotMinutes: attendee.slotMinutes ?? DEFAULT_SLOT_MINUTES })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="size-3.5" /> Termin
      </span>
      {days.length > 1 && (
        <select
          className={selectCls}
          value={day}
          aria-label="Tag des Termins"
          onChange={(e) => {
            setDay(e.target.value)
            commitSlot(e.target.value, time)
          }}
        >
          {days.map((d) => (
            <option key={d} value={d}>
              {formatDate(d)}
            </option>
          ))}
        </select>
      )}
      <Input
        type="time"
        value={time}
        aria-label="Uhrzeit des Termins"
        className="w-28"
        onChange={(e) => setTime(e.target.value)}
        onBlur={(e) => commitSlot(day, e.target.value)}
      />
      {attendee.slotAt && (
        <>
          <select
            className={selectCls}
            value={attendee.slotMinutes ?? DEFAULT_SLOT_MINUTES}
            aria-label="Dauer in Minuten"
            onChange={(e) => onSave({ slotMinutes: Number(e.target.value) })}
          >
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {m} Min.
              </option>
            ))}
          </select>
          <Input
            value={point}
            aria-label="Treffpunkt"
            className="min-w-40 flex-1"
            placeholder="Treffpunkt, z. B. Halle 4, Stand B3"
            onChange={(e) => setPoint(e.target.value)}
            onBlur={(e) => {
              const next = e.target.value.trim()
              if (next !== (attendee.meetingPoint ?? '')) {
                onSave({ meetingPoint: next || null })
              }
            }}
          />
          {hasConflict && (
            <Badge variant="warning" className="shrink-0">
              <AlertTriangle className="size-3" /> Überschneidung
            </Badge>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Eine Gastzeile. Ist der Gast bereits befördert (`promotedContactId`), zeigt sie
 * nur den Verweis auf den Kontakt und blendet die Bearbeitungsknöpfe aus. Sonst
 * (nur RM+) „Zu Kontakt machen“ mit einem inline Region-/RM-Wähler und Entfernen.
 */
function GuestRow({
  guest,
  regions,
  users,
  defaultRegionId,
  defaultManagerId,
  canEdit,
  onPromote,
  onRemove,
}: {
  guest: EventGuest
  regions: Region[]
  users: AppUser[]
  defaultRegionId: string
  defaultManagerId: string
  canEdit: boolean
  onPromote: (guestId: string, regionId: string, relationshipManagerId: string) => Promise<void>
  onRemove: (guestId: string) => void
}) {
  const [promoting, setPromoting] = useState(false)
  const [regionId, setRegionId] = useState(defaultRegionId)
  const [managerId, setManagerId] = useState(defaultManagerId)
  const [busy, setBusy] = useState(false)

  const promoted = Boolean(guest.promotedContactId)
  const meta = [guest.company, guest.note].filter(Boolean).join(' · ')

  const confirmPromote = async () => {
    if (!regionId || !managerId) return
    setBusy(true)
    try {
      await onPromote(guest.id, regionId, managerId)
      setPromoting(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {promoted ? (
              <Link
                to={`/contacts/${guest.promotedContactId}`}
                className="truncate text-sm font-medium hover:underline"
              >
                {guest.name}
              </Link>
            ) : (
              <span className="truncate text-sm font-medium">{guest.name}</span>
            )}
            {promoted && (
              <Badge variant="success" className="shrink-0">
                <UserCheck className="size-3" /> Kontakt
              </Badge>
            )}
          </div>
          {meta && <div className="truncate text-xs text-muted-foreground">{meta}</div>}
        </div>
        {canEdit && !promoted && (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setPromoting((v) => !v)}>
              <UserPlus className="size-4" /> Zu Kontakt machen
            </Button>
            <button
              type="button"
              onClick={() => onRemove(guest.id)}
              aria-label="Gast entfernen"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>
      {canEdit && !promoted && promoting && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/50 p-2">
          <span className="text-xs text-muted-foreground">Als Kontakt anlegen:</span>
          <select
            className={selectCls}
            aria-label="Region"
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.isPlaceholder ? ' (Platzhalter)' : ''}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            aria-label="Relationship Manager"
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={confirmPromote} disabled={busy || !regionId || !managerId}>
            {busy ? 'Übernehme…' : 'Übernehmen'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPromoting(false)}>
            Abbrechen
          </Button>
        </div>
      )}
    </li>
  )
}

/** Inline-Formular (kein Modal — es gibt keine Dialog-Primitive) zum Erfassen eines Gastes. */
function AddGuestForm({
  onAdd,
}: {
  onAdd: (input: { name: string; company: string; note: string }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await onAdd({ name, company, note })
      setName('')
      setCompany('')
      setNote('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Name des Gastes"
          placeholder="Name"
          className="sm:flex-1"
        />
        <Input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          aria-label="Firma des Gastes"
          placeholder="Firma (optional)"
          className="sm:flex-1"
        />
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="Notiz zum Gast"
        placeholder="Notiz (optional), z. B. wo getroffen"
      />
      <Button size="sm" variant="outline" onClick={submit} disabled={busy || !name.trim()}>
        <Plus className="size-4" /> Gast hinzufügen
      </Button>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/events"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Alle Events
    </Link>
  )
}
