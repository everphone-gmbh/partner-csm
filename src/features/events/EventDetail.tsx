import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, MapPin, Plus, Trash2 } from 'lucide-react'
import type { AttendanceStatus, Contact, EventAttendee, EventItem } from '@/domain/types'
import { mockRepository } from '@/data/mockRepository'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/format'
import { ATTENDANCE_LABEL, ATTENDANCE_ORDER, ATTENDANCE_VARIANT } from './eventMeta'
import { EventNotes } from './EventNotes'

const selectCls =
  'h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function EventDetail() {
  const { id } = useParams()
  const [event, setEvent] = useState<EventItem | undefined>(undefined)
  const [attendees, setAttendees] = useState<EventAttendee[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [addId, setAddId] = useState('')

  const loadAttendees = () => {
    if (id) void mockRepository.listEventAttendees(id).then(setAttendees)
  }

  useEffect(() => {
    if (!id) return
    let active = true
    Promise.all([
      mockRepository.getEvent(id),
      mockRepository.listEventAttendees(id),
      mockRepository.listContacts(),
    ]).then(([e, a, c]) => {
      if (!active) return
      setEvent(e)
      setAttendees(a)
      setContacts(c)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [id])

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
  const sorted = useMemo(
    () =>
      [...attendees].sort(
        (a, b) => ATTENDANCE_ORDER.indexOf(a.status) - ATTENDANCE_ORDER.indexOf(b.status),
      ),
    [attendees],
  )
  const notAttending = contacts.filter((c) => !attendees.some((a) => a.contactId === c.id))

  const setStatus = async (contactId: string, status: AttendanceStatus) => {
    setAttendees((prev) => prev.map((a) => (a.contactId === contactId ? { ...a, status } : a)))
    if (id) await mockRepository.setAttendee(id, contactId, { status })
  }
  const editPurpose = (contactId: string, purpose: string) =>
    setAttendees((prev) => prev.map((a) => (a.contactId === contactId ? { ...a, purpose } : a)))
  const savePurpose = async (contactId: string, purpose: string) => {
    if (id) await mockRepository.setAttendee(id, contactId, { purpose })
  }
  const removeAttendee = async (contactId: string) => {
    if (!id) return
    await mockRepository.removeAttendee(id, contactId)
    loadAttendees()
  }
  const addAttendee = async () => {
    if (!id || !addId) return
    await mockRepository.setAttendee(id, addId, { status: 'invited' })
    setAddId('')
    loadAttendees()
  }

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>
  if (!event) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="text-sm text-muted-foreground">Event nicht gefunden.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <BackLink />

      <Card>
        <CardContent className="space-y-2 pt-5">
          <h1 className="text-xl font-semibold">{event.name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-4" />
              {formatDate(event.date)}
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

      <EventNotes eventId={event.id} />

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
        <CardHeader>
          <CardTitle className="text-base">Teilnehmer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
