import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, History, Paperclip, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { Activity, ActivityType, Contact, Reminder, SentimentEntry } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { useRepoQuery } from '@/app/useRepoQuery'
import { QueryError } from '@/components/QueryError'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { VoiceRecorder } from '@/components/VoiceRecorder'
import { canApprove, canViewActivityBody } from '@/domain/roles'
import {
  autoExtractAvailable,
  extractViaServer,
  transcribeViaServer,
} from '@/features/contacts/transcript/autoExtract'
import {
  parseSuggestions,
  planApply,
  type ExtractionSuggestion,
} from '@/features/contacts/transcript/extraction'
import { SuggestionReview, type ApplyResult } from '@/features/contacts/transcript/SuggestionReview'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { TrafficLightDot, TRAFFIC_LABEL } from '@/components/TrafficLight'
import { formatDate, formatDateTime, formatRelative, daysUntil } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ACTIVITY_META } from './activityMeta'
import { filterHistory, groupHistory, type TimelineEntry, type TimelineFilter } from './timelineHistory'

const ADD_TYPES: ActivityType[] = ['note', 'call', 'email', 'meeting']

const FILTERS: { value: TimelineFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'call', label: 'Anrufe' },
  { value: 'email', label: 'E-Mails' },
  { value: 'meeting', label: 'Treffen' },
  { value: 'note', label: 'Notizen' },
  { value: 'sentiment', label: 'Status' },
]

/** Coloured type-chip per history kind, using the app's own tokens. */
const TYPE_CHIP_CLASS: Record<ActivityType | 'sentiment', string> = {
  note: 'bg-primary/10 text-primary',
  call: 'bg-status-green/15 text-status-green',
  email: 'bg-accent text-accent-foreground',
  meeting: 'bg-teal/15 text-teal',
  social: 'bg-secondary text-secondary-foreground',
  sentiment: 'bg-secondary text-secondary-foreground',
}

/** Stable identity for a history entry — used for React keys AND add-detection. */
function entryId(entry: TimelineEntry): string {
  return entry.kind === 'activity'
    ? `a-${entry.activity.id}`
    : `s-${entry.entry.at}-${entry.entry.value}`
}

/** Length + newest-id fingerprint: cheap, and stable across a fresh `[]`. */
function signature(entries: TimelineEntry[]): string {
  return `${entries.length}|${entries[0] ? entryId(entries[0]) : ''}`
}

/**
 * The unified activity timeline: replaces the separate Logbook and
 * RemindersCard. "Upcoming" (open reminders) is forward-looking and rendered
 * separately from the reverse-chronological "Verlauf" (activities + sentiment
 * changes), since a due date and a past event aren't the same kind of thing.
 *
 * The activity query lives in ContactProfile, not here: the Historie timeline
 * renders the same data and would go stale after every new entry otherwise.
 * Reminders stay local — nothing else needs them.
 */
export function Timeline({
  contact,
  entries,
  error,
  onReload,
  onApplyFacts,
}: {
  contact: Contact
  entries: TimelineEntry[]
  error?: Error
  onReload: () => void
  /**
   * Übernimmt aus einer Notiz vorgeschlagene Fakten auf die Karte (Feedback #7).
   * Ohne diese Funktion gibt es den Vorschlags-Knopf nicht; ContactProfile
   * reicht sein `save` herein.
   */
  onApplyFacts?: (patch: ContactPatch) => Promise<void>
}) {
  const { user } = useSession()
  const canBody = canViewActivityBody(user.role)

  const [filter, setFilter] = useState<TimelineFilter>('all')

  const remindersQ = useRepoQuery(() => repository.listReminders(contact.id), [contact.id])
  const reminders = remindersQ.data ?? []

  const history = useMemo(() => filterHistory(entries, filter), [entries, filter])
  const groups = useMemo(() => groupHistory(history), [history])
  const openReminders = reminders.filter((r) => !r.done)
  const queryError = error ?? remindersQ.error

  // Tier 4: spot a freshly-added entry so the newest row can slide in and glow.
  // This is the supported "adjust state during render" pattern (store previous
  // props): React re-renders before painting, so the new row's very first paint
  // already carries `tl-new` — no flicker. It's gated on a length+top signature
  // so a fresh `[]` during loading can't loop, and it only fires on an
  // incremental growth of an already-populated list, so the initial load and
  // reloads never glow.
  const [prevEntries, setPrevEntries] = useState<TimelineEntry[]>(entries)
  const [prevSig, setPrevSig] = useState(() => signature(entries))
  const [newId, setNewId] = useState<string | null>(null)
  const sig = signature(entries)
  if (sig !== prevSig) {
    const before = new Set(prevEntries.map(entryId))
    const added = entries.find((e) => !before.has(entryId(e)))
    const grewByOne = entries.length === prevEntries.length + 1 && prevEntries.length > 0
    setNewId(grewByOne && added ? entryId(added) : null)
    setPrevEntries(entries)
    setPrevSig(sig)
  }
  useEffect(() => {
    if (!newId) return
    const t = setTimeout(() => setNewId(null), 1300)
    return () => clearTimeout(t)
  }, [newId])

  return (
    <Card className="lg:sticky lg:top-[4.5rem]">
      <CardHeader>
        <CardTitle className="text-base">Aktivität</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {queryError && (
          <QueryError
            error={queryError}
            retry={() => {
              onReload()
              remindersQ.retry()
            }}
          />
        )}
        <AddActivityForm contact={contact} onAdded={onReload} onApplyFacts={onApplyFacts} />

        <Separator />

        <UpcomingReminders
          contactId={contact.id}
          reminders={openReminders}
          onChanged={remindersQ.retry}
        />

        <Separator />

        {/*
          Filter as a single horizontal scroll row instead of the old
          flex-wrap: this card is only ~320–380px wide, so wrapping stacked the
          chips into several lines. The right-edge mask hints at more to scroll.
        */}
        <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-mask-image:linear-gradient(to_right,#000_88%,transparent)] [-webkit-overflow-scrolling:touch] [mask-image:linear-gradient(to_right,#000_88%,transparent)]">
          {FILTERS.map((f) => {
            const active = filter === f.value
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'inline-flex min-h-9 flex-none items-center whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Keyed by filter so a change cross-fades the list (Tier 4). */}
        <div key={filter} className="tl-fade">
          {history.length === 0 ? (
            <EmptyState hasAny={entries.length > 0} />
          ) : (
            <div className="space-y-5">
              {groups.map((group) => (
                <section key={group.key}>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </h3>
                  <div className="relative">
                    {/* Rail connector — a hairline down the left of the nodes. */}
                    <span
                      aria-hidden
                      className="absolute bottom-2 left-[13px] top-2 w-px bg-border"
                    />
                    <ul className="space-y-4">
                      {group.entries.map((entry) =>
                        entry.kind === 'activity' ? (
                          <ActivityItem
                            key={entryId(entry)}
                            activity={entry.activity}
                            canBody={canBody}
                            isNew={newId === entryId(entry)}
                          />
                        ) : (
                          <SentimentItem
                            key={entryId(entry)}
                            entry={entry.entry}
                            isNew={newId === entryId(entry)}
                          />
                        ),
                      )}
                    </ul>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Unter so vielen Zeichen gibt es nichts zu belegen — der Vorschlags-Knopf bleibt aus. */
const MIN_FACTS_CHARS = 20

function AddActivityForm({
  contact,
  onAdded,
  onApplyFacts,
}: {
  contact: Contact
  onAdded: () => void
  onApplyFacts?: (patch: ContactPatch) => Promise<void>
}) {
  const { user } = useSession()
  const { toast } = useToast()
  const [type, setType] = useState<ActivityType>('note')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  // Sprachmemo + Fakten-Vorschlag (Feedback #7): nur mit erreichbarem
  // KI-Endpoint (im Demo-Modus nie) und nur für RM+ — die Edge Functions
  // verlangen die Rolle serverseitig, Account Manager sähen sonst Knöpfe, die
  // in einem 403 enden. Meldet der Endpoint not_configured, verschwinden die
  // Knöpfe für diese Sitzung, statt bei jedem Klick erneut zu scheitern.
  const [endpointMissing, setEndpointMissing] = useState(false)
  const showMemo = autoExtractAvailable() && canApprove(user.role) && !endpointMissing
  const [transcribing, setTranscribing] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [suggestions, setSuggestions] = useState<ExtractionSuggestion[] | null>(null)
  const [approved, setApproved] = useState<Set<string>>(() => new Set())
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<ApplyResult | null>(null)
  const busy = saving || transcribing || extracting || applying

  const submit = async () => {
    const text = body.trim()
    if (!text) return
    setSaving(true)
    try {
      await repository.addActivity({
        contactId: contact.id,
        type,
        occurredAt: new Date().toISOString(),
        authorId: user.id,
        authorName: user.name,
        body: text,
      })
      // Nur das Feld leeren — eine offene Vorschlagsliste bleibt stehen, sie
      // gehört zur Karte, nicht zur gespeicherten Notiz.
      setBody('')
      onAdded()
    } catch (err) {
      toast(saveErrorMessage(err)) // keep the typed text so nothing is lost
    } finally {
      setSaving(false)
    }
  }

  const notConfigured = () => {
    toast('KI-Endpoint ist noch nicht freigeschaltet.')
    setEndpointMissing(true)
  }

  // Sprachnotiz NACH dem Gespräch (kein Mitschnitt): Audio → transcribe-memo →
  // Text landet im Eingabefeld und wird über den normalen Weg als Notiz
  // gespeichert. Das Audio wird nirgends abgelegt.
  const transcribeMemo = async (audio: Blob) => {
    setTranscribing(true)
    try {
      const r = await transcribeViaServer(audio)
      if (!r.ok) {
        if (r.notConfigured) notConfigured()
        else toast(r.error ?? 'Transkription fehlgeschlagen.')
        return
      }
      const text = r.transcript ?? ''
      // Anhängen, nicht ersetzen: was schon getippt ist, bleibt.
      setBody((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${text}` : text))
    } finally {
      setTranscribing(false)
    }
  }

  const suggestFacts = async () => {
    const text = body.trim()
    if (text.length < MIN_FACTS_CHARS) return
    setExtracting(true)
    try {
      const r = await extractViaServer(text, contact.fullName)
      if (!r.ok) {
        if (r.notConfigured) notConfigured()
        else toast(r.error ?? 'KI-Aufruf fehlgeschlagen.')
        return
      }
      const parsed = parseSuggestions(r.raw ?? '')
      if (!parsed.ok) {
        toast(parsed.error ?? 'Die Antwort konnte nicht gelesen werden.')
        return
      }
      // Wie in der Transkript-Karte: alles Nicht-Gesperrte ist vorausgewählt.
      setSuggestions(parsed.suggestions)
      setApproved(new Set(parsed.suggestions.filter((s) => !s.blocked).map((s) => s.id)))
      setResult(null)
    } finally {
      setExtracting(false)
    }
  }

  const toggleApproved = (id: string) =>
    setApproved((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const applyFacts = async () => {
    if (!suggestions || !onApplyFacts) return
    const chosen = suggestions.filter((s) => approved.has(s.id) && !s.blocked)
    const plan = planApply(contact, chosen)
    setApplying(true)
    try {
      if (plan.applied > 0) await onApplyFacts(plan.patch)
      setResult({ applied: plan.applied, skipped: plan.skipped })
      setSuggestions(null)
    } catch {
      // onApplyFacts (ContactProfile.save) zeigt bereits einen Toast — Liste offen lassen.
    } finally {
      setApplying(false)
    }
  }

  const closeReview = () => {
    setSuggestions(null)
    setResult(null)
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
      {/*
        Segmented control instead of a wrapping pill row: four equal cells that
        never break onto a second line at this card's width.
      */}
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-secondary p-1">
        {ADD_TYPES.map((t) => {
          const { label, icon: Icon } = ACTIVITY_META[t]
          const active = type === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={active}
              className={cn(
                'flex min-w-0 flex-col items-center gap-1 rounded-md py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className={cn('size-4', active && 'text-primary')} />
              <span className="w-full truncate text-center leading-none">{label}</span>
            </button>
          )
        })}
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Was ist passiert? Beliebig lang — eine KI-Zusammenfassung wird automatisch erzeugt."
      />
      {showMemo && (
        <div className="flex flex-wrap items-center gap-2">
          <VoiceRecorder label="Sprachmemo" onRecorded={(audio) => void transcribeMemo(audio)} />
          {transcribing && (
            <span role="status" className="text-xs text-muted-foreground">
              Transkribiere …
            </span>
          )}
          {/*
            Rechts, solange Platz ist, sonst eigene Zeile (flex-wrap + ml-auto).
            max-w-full und whitespace-normal lassen die Beschriftung im Knopf
            umbrechen, statt aus der ~320px schmalen Karte zu laufen.
          */}
          {onApplyFacts && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={suggestFacts}
              disabled={body.trim().length < MIN_FACTS_CHARS || busy}
              className="ml-auto h-auto min-h-9 max-w-full whitespace-normal py-1.5"
            >
              <Sparkles className="size-4" />
              {extracting ? 'Analysiere …' : 'Fakten für die Karte vorschlagen'}
            </Button>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">wird als {user.name} gespeichert</span>
        <Button size="sm" onClick={submit} disabled={!body.trim() || saving}>
          {saving ? 'Speichern…' : 'Eintrag speichern'}
        </Button>
      </div>
      {(suggestions || result) && (
        <div className="space-y-2 border-t border-border pt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Vorschläge für die Karte
          </p>
          <SuggestionReview
            suggestions={suggestions ?? []}
            approved={approved}
            onToggle={toggleApproved}
            onApply={applyFacts}
            applying={applying}
            result={result}
          >
            <button
              type="button"
              onClick={closeReview}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Schließen
            </button>
          </SuggestionReview>
        </div>
      )}
    </div>
  )
}

function UpcomingReminders({
  contactId,
  reminders,
  onChanged,
}: {
  contactId: string
  reminders: Reminder[]
  onChanged: () => void
}) {
  const { user } = useSession()
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  const [dueTime, setDueTime] = useState('')

  const add = async () => {
    if (!text.trim() || !due) return
    try {
      await repository.addReminder({
        contactId,
        dueDate: due,
        dueTime: dueTime || undefined,
        text: text.trim(),
        createdByName: user.name,
      })
    } catch (err) {
      toast(saveErrorMessage(err))
      return
    }
    setText('')
    setDue('')
    setDueTime('')
    onChanged()
  }
  const toggle = async (r: Reminder) => {
    try {
      await repository.toggleReminder(r.id, !r.done)
    } catch (err) {
      toast(saveErrorMessage(err))
      return
    }
    onChanged()
  }
  const remove = async (id: string) => {
    try {
      await repository.deleteReminder(id)
    } catch (err) {
      toast(saveErrorMessage(err))
      return
    }
    onChanged()
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Anstehend</div>
      {reminders.length > 0 && (
        <ul className="space-y-1.5">
          {reminders.map((r) => {
            const d = daysUntil(r.dueDate)
            const overdue = d !== null && d < 0
            return (
              <li key={r.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={r.done}
                  onChange={() => toggle(r)}
                  className="mt-1 size-4 accent-primary"
                  aria-label="Erledigt"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{r.text}</div>
                  <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span>
                      {formatDate(r.dueDate)}
                      {r.dueTime ? ` · ${r.dueTime} Uhr` : ''}
                    </span>
                    {d !== null && (
                      <Badge variant={overdue ? 'destructive' : d <= 3 ? 'warning' : 'secondary'}>
                        {overdue ? 'überfällig' : d === 0 ? 'heute' : `in ${d} T.`}
                      </Badge>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  aria-label="Reminder löschen"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {/*
        Container-safe add form. `sm:` is a viewport breakpoint, not a container
        one, so the old single row cramped inside this ~320–380px card: the text
        field takes its own full-width row, then date + time share the next row,
        and the button gets a full-width tap target of its own — all usable down
        to ~320px without horizontal overflow.
      */}
      <div className="space-y-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Woran erinnern?"
        />
        <div className="flex gap-2">
          <Input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label="Fällig am"
            className="min-w-0 flex-1"
          />
          <Input
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            aria-label="Uhrzeit (optional)"
            className="w-24 shrink-0"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={add}
          disabled={!text.trim() || !due}
          className="w-full"
        >
          <Plus className="size-4" /> Reminder
        </Button>
      </div>
    </div>
  )
}

/** Small initials disc standing in for the "von …" attribution (Tier 3). */
function MiniAvatar({ name }: { name?: string }) {
  if (!name) return null
  const initials =
    name
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  return (
    <span
      title={name}
      aria-label={`Erfasst von ${name}`}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
    >
      {initials}
    </span>
  )
}

function TypeChip({ kind, label }: { kind: ActivityType | 'sentiment'; label: string }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TYPE_CHIP_CLASS[kind])}>
      {label}
    </span>
  )
}

/** Meta line shared by both row kinds: who · what type · when. */
function MetaLine({
  kind,
  label,
  at,
  author,
}: {
  kind: ActivityType | 'sentiment'
  label: string
  at: string
  author?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <MiniAvatar name={author} />
      <TypeChip kind={kind} label={label} />
      <time dateTime={at} title={formatDateTime(at)}>
        {formatRelative(at)}
      </time>
    </div>
  )
}

function ActivityItem({
  activity,
  canBody,
  isNew,
}: {
  activity: Activity
  canBody: boolean
  isNew?: boolean
}) {
  const [open, setOpen] = useState(false)
  const { label, icon: Icon } = ACTIVITY_META[activity.type]
  // Redacted tier must NEVER see the raw body — when no AI summary exists,
  // show a placeholder rather than falling back to the confidential text.
  const summary = canBody
    ? activity.aiSummary || activity.body
    : activity.aiSummary || 'Für Ihre Rolle nur als KI-Zusammenfassung sichtbar — noch keine vorhanden.'
  const hasMore = Boolean(activity.body && activity.aiSummary && activity.body !== activity.aiSummary)

  return (
    <li className={cn('relative pl-9', isNew && 'tl-new')}>
      <span className="absolute left-[5px] top-0.5 flex size-[18px] items-center justify-center rounded-full border-2 border-border bg-card text-muted-foreground">
        <Icon className="size-3" />
      </span>
      <div className="min-w-0">
        <MetaLine kind={activity.type} label={label} at={activity.occurredAt} author={activity.authorName} />
        <p className="mt-1 text-sm text-foreground">{summary}</p>

        {canBody
          ? hasMore && (
              <>
                <button
                  type="button"
                  onClick={() => setOpen((o) => !o)}
                  className="mt-1 inline-flex items-center gap-1 rounded text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
                  {open ? 'Weniger' : 'Mehr Details'}
                </button>
                {open && (
                  <p className="mt-1 whitespace-pre-wrap rounded-md bg-secondary/50 p-2 text-sm text-foreground">
                    {activity.body}
                  </p>
                )}
              </>
            )
          : hasMore && (
              <p className="mt-1 text-xs italic text-muted-foreground">
                Volltext für Ihre Rolle nicht sichtbar
              </p>
            )}

        {activity.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {activity.attachments.map((a) => (
              <Badge key={a.id} variant="secondary">
                <Paperclip className="size-3" /> {a.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

function SentimentItem({ entry, isNew }: { entry: SentimentEntry; isNew?: boolean }) {
  return (
    <li className={cn('relative pl-9', isNew && 'tl-new')}>
      <span className="absolute left-[5px] top-0.5 flex size-[18px] items-center justify-center rounded-full border-2 border-border bg-card">
        <TrafficLightDot value={entry.value} />
      </span>
      <div className="min-w-0">
        <MetaLine kind="sentiment" label="Status" at={entry.at} author={entry.byName} />
        <p className="mt-1 text-sm text-foreground">
          Beziehung auf „{TRAFFIC_LABEL[entry.value]}“ gesetzt.
        </p>
      </div>
    </li>
  )
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  if (hasAny) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">Keine Einträge für diesen Filter.</p>
    )
  }
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <History className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">Noch keine Aktivitäten</p>
      <p className="max-w-[42ch] text-xs text-muted-foreground">
        Halte oben fest, was besprochen wurde — Notizen, Anrufe, E-Mails und Treffen erscheinen hier
        als Verlauf.
      </p>
    </div>
  )
}
