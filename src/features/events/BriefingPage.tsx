import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Clock, MapPin, Sparkles, Tag } from 'lucide-react'
import type { AttendanceStatus, Contact, EventAttendee } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { canViewSensitiveFields, redactContactForRole } from '@/domain/roles'
import { BUYING_ROLE_LABEL, BUYING_ROLE_VARIANT } from '@/domain/buyingCenter'
import { useScopedContacts } from '@/app/useScopedContacts'
import { lastTouchDate } from '@/domain/attention'
import { localSummarizer } from '@/domain/ai'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/format'
import { bySlotFirst, isMultiDay, slotTimeLabel } from './eventScheduling'
import { ATTENDANCE_LABEL, ATTENDANCE_VARIANT } from './eventMeta'
import { MetPill } from './MetPill'

/** Sort: who you're about to meet first. */
const BRIEFING_ORDER: AttendanceStatus[] = ['accepted', 'invited', 'attended', 'no_show', 'declined']

/**
 * Vor-Ort-Briefing (Event-Pulse-inspired): all attendees of one event as
 * mobile-first briefing cards — who am I about to meet, what is the meeting
 * about, what do I need to know. Respects the 3-tier redaction (Account
 * Managers see the AI intro and professional fields only) and the AM region
 * scope, per Partner_CSM_Anforderungen (Rollen & Freigaben).
 */
export function BriefingPage() {
  const { id } = useParams()
  const { user } = useSession()
  const { toast } = useToast()
  const canSensitive = canViewSensitiveFields(user.role)
  const [attendees, setAttendees] = useState<EventAttendee[]>([])

  const { data, loading, error, retry } = useRepoQuery(
    () =>
      Promise.all([
        repository.getEvent(id ?? ''),
        repository.listEventAttendees(id ?? ''),
        repository.listContacts(),
        repository.listRegions(),
        repository.listUsers(),
        repository.listAllActivities(),
        repository.listEventNotes(id ?? ''),
        repository.listEventGuests(id ?? ''),
      ]),
    [id],
  )
  const event = data?.[0]
  const contacts = useMemo(() => data?.[2] ?? [], [data])
  const regions = data?.[3] ?? []
  const users = data?.[4] ?? []
  const activities = useMemo(() => data?.[5] ?? [], [data])
  const eventNotes = useMemo(() => data?.[6] ?? [], [data])
  const guests = useMemo(() => data?.[7] ?? [], [data])
  useEffect(() => {
    setAttendees(data?.[1] ?? [])
  }, [data])

  const { scoped } = useScopedContacts(contacts)
  const scopedById = useMemo(() => new Map(scoped.map((c) => [c.id, c])), [scoped])

  const cards = useMemo(() => {
    return attendees
      .map((a) => ({ attendee: a, contact: scopedById.get(a.contactId) }))
      .filter((x): x is { attendee: EventAttendee; contact: Contact } => Boolean(x.contact))
      // Vor Ort zählt die Uhrzeit: terminierte Gespräche chronologisch zuerst,
      // danach die übrigen nach Status.
      .sort(
        (x, y) =>
          bySlotFirst(x.attendee, y.attendee) ||
          BRIEFING_ORDER.indexOf(x.attendee.status) - BRIEFING_ORDER.indexOf(y.attendee.status) ||
          x.contact.fullName.localeCompare(y.contact.fullName, 'de'),
      )
  }, [attendees, scopedById])

  const metCount = cards.filter((c) => c.attendee.status === 'attended').length
  const plannedCount = cards.filter((c) =>
    ['accepted', 'attended', 'invited'].includes(c.attendee.status),
  ).length

  const setStatus = async (contactId: string, status: AttendanceStatus) => {
    const before = attendees
    setAttendees((prev) => prev.map((a) => (a.contactId === contactId ? { ...a, status } : a)))
    try {
      if (id) await repository.setAttendee(id, contactId, { status })
    } catch (err) {
      setAttendees(before)
      toast(saveErrorMessage(err))
    }
  }

  if (error) return <QueryError error={error} retry={retry} />
  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Lädt…</p>
  if (!event) {
    return (
      <div className="space-y-3">
        <Link to="/events" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Alle Events
        </Link>
        <p className="text-sm text-muted-foreground">Event nicht gefunden.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-3">
      {/* Sticky event header: where am I, how far along */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-black/[0.05] bg-background/80 px-4 py-3 backdrop-blur-xl lg:top-[-2rem] dark:border-white/[0.08]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/events/${event.id}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3" /> Event
            </Link>
            <h1 className="truncate text-lg font-semibold tracking-tight">{event.name}</h1>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" />{' '}
                {isMultiDay(event)
                  ? `${formatDate(event.date)} – ${formatDate(event.endDate!)}`
                  : formatDate(event.date)}
              </span>
              {event.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" /> {event.location}
                </span>
              )}
            </p>
          </div>
          <Badge variant={metCount > 0 ? 'success' : 'secondary'} className="shrink-0">
            {metCount}/{plannedCount} getroffen
          </Badge>
        </div>
      </div>

      {cards.length === 0 && guests.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Keine Teilnehmer in deinem Sichtbereich.
        </p>
      )}

      {cards.map(({ attendee, contact }) => {
        const view = redactContactForRole(contact, user.role)
        const regionName = regions.find((r) => r.id === view.regionId)?.name
        const managerName = users.find((u) => u.id === view.relationshipManagerId)?.name
        const intro = localSummarizer.contactIntro(view, { regionName, managerName })
        const lastTouch = formatDate(lastTouchDate(contact, activities))
        // Notes captured about this person at THIS event (incl. memo transcripts).
        const personNotes = eventNotes
          .filter((n) => n.contactId === contact.id)
          .flatMap((n) => [
            ...(n.text ? [n.text] : []),
            ...n.attachments.filter((a) => a.transcript).map((a) => `🎙 ${a.transcript}`),
          ])
          .slice(0, 3)
        return (
          <Card key={contact.id} className="overflow-hidden">
            <CardContent className="space-y-3 pt-5 sm:pt-5">
              <div className="flex items-start gap-3">
                <Avatar src={view.photoUrl} name={view.fullName} className="size-12 text-base" />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/contacts/${contact.id}`}
                    className="block truncate text-base font-semibold hover:underline"
                  >
                    {view.fullName}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">
                    {view.position || '—'}
                    {view.company ? ` · ${view.company}` : ''}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{regionName ?? '—'}</Badge>
                    {view.buyingRole && (
                      <Badge variant={BUYING_ROLE_VARIANT[view.buyingRole]}>
                        {BUYING_ROLE_LABEL[view.buyingRole]}
                      </Badge>
                    )}
                    {attendee.status !== 'accepted' && attendee.status !== 'attended' && attendee.status !== 'no_show' && (
                      <Badge variant={ATTENDANCE_VARIANT[attendee.status]}>
                        {ATTENDANCE_LABEL[attendee.status]}
                      </Badge>
                    )}
                  </div>
                </div>
                <MetPill
                  status={attendee.status}
                  onChange={(next) => setStatus(contact.id, next)}
                />
              </div>

              {attendee.slotAt && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-secondary px-3 py-2 text-sm">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <Clock className="size-4 text-primary" />
                    {isMultiDay(event) && `${formatDate(attendee.slotAt)}, `}
                    {slotTimeLabel(attendee.slotAt)} Uhr
                  </span>
                  {attendee.meetingPoint && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <MapPin className="size-3.5" /> {attendee.meetingPoint}
                    </span>
                  )}
                </div>
              )}

              {attendee.purpose && (
                <div className="rounded-lg bg-primary/5 px-3 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-primary">
                    Wofür
                  </div>
                  <p className="text-sm">{attendee.purpose}</p>
                </div>
              )}

              <div className="flex gap-2 rounded-lg bg-secondary/60 px-3 py-2">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <p className="text-sm text-foreground/90">{intro}</p>
              </div>

              {canSensitive && view.sideFacts.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag className="size-3.5 text-muted-foreground" />
                  {view.sideFacts.map((f) => (
                    <Badge key={f.id} variant="outline">
                      {f.label}
                    </Badge>
                  ))}
                </div>
              )}

              {personNotes.length > 0 && (
                <div className="space-y-1 rounded-lg border border-black/[0.04] bg-card px-3 py-2 dark:border-white/[0.06]">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Notizen vom Event
                  </div>
                  {personNotes.map((t, i) => (
                    <p key={i} className="text-sm text-foreground/90">
                      {t}
                    </p>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Letzter Kontakt: {lastTouch}
                {managerName ? ` · RM: ${managerName}` : ''}
              </p>
            </CardContent>
          </Card>
        )
      })}

      {guests.length > 0 && (
        <div className="space-y-2 pt-1">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">
            Gäste ({guests.length})
          </h2>
          {guests.map((g) => {
            const meta = [g.company, g.note].filter(Boolean).join(' · ')
            return (
              <Card key={g.id} className="overflow-hidden">
                <CardContent className="flex items-center gap-3 pt-5 sm:pt-5">
                  <Avatar name={g.name} className="size-10" />
                  <div className="min-w-0 flex-1">
                    {g.promotedContactId ? (
                      <Link
                        to={`/contacts/${g.promotedContactId}`}
                        className="block truncate text-sm font-semibold hover:underline"
                      >
                        {g.name}
                      </Link>
                    ) : (
                      <div className="truncate text-sm font-semibold">{g.name}</div>
                    )}
                    {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
                  </div>
                  {g.promotedContactId && (
                    <Badge variant="success" className="shrink-0">
                      Kontakt
                    </Badge>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
