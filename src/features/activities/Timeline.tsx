import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Paperclip, Plus, Trash2 } from 'lucide-react'
import type { Activity, ActivityType, Contact, Reminder, SentimentEntry } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { canViewActivityBody } from '@/domain/roles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { TrafficLightDot, TRAFFIC_LABEL } from '@/components/TrafficLight'
import { formatDate, formatDateTime, daysUntil } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ACTIVITY_META } from './activityMeta'
import { buildHistory, filterHistory, type TimelineFilter } from './timelineHistory'

const ADD_TYPES: ActivityType[] = ['note', 'call', 'email', 'meeting']

const FILTERS: { value: TimelineFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'call', label: 'Anrufe' },
  { value: 'email', label: 'E-Mails' },
  { value: 'meeting', label: 'Treffen' },
  { value: 'note', label: 'Notizen' },
  { value: 'sentiment', label: 'Status' },
]

/**
 * The unified activity timeline: replaces the separate Logbook and
 * RemindersCard. "Upcoming" (open reminders) is forward-looking and rendered
 * separately from the reverse-chronological "Verlauf" (activities + sentiment
 * changes), since a due date and a past event aren't the same kind of thing.
 */
export function Timeline({ contact }: { contact: Contact }) {
  const { user } = useSession()
  const canBody = canViewActivityBody(user.role)

  const [activities, setActivities] = useState<ReturnType<typeof buildHistory>>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [filter, setFilter] = useState<TimelineFilter>('all')

  const refreshActivities = () => {
    void repository.listActivities(contact.id).then((items) => {
      setActivities(buildHistory(items, contact.sentimentHistory))
    })
  }
  const refreshReminders = () => {
    void repository.listReminders(contact.id).then(setReminders)
  }

  useEffect(refreshActivities, [contact.id, contact.sentimentHistory])
  useEffect(refreshReminders, [contact.id])

  const history = useMemo(() => filterHistory(activities, filter), [activities, filter])
  const openReminders = reminders.filter((r) => !r.done)

  return (
    <Card className="lg:sticky lg:top-[4.5rem]">
      <CardHeader>
        <CardTitle className="text-base">Aktivität</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AddActivityForm contactId={contact.id} onAdded={refreshActivities} />

        <Separator />

        <UpcomingReminders
          contactId={contact.id}
          reminders={openReminders}
          onChanged={refreshReminders}
        />

        <Separator />

        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                filter === f.value
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Einträge.</p>
        ) : (
          <ul className="space-y-4">
            {history.map((entry) =>
              entry.kind === 'activity' ? (
                <ActivityItem key={entry.activity.id} activity={entry.activity} canBody={canBody} />
              ) : (
                <SentimentItem key={entry.at + (entry.entry.byName ?? '')} entry={entry.entry} />
              ),
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function AddActivityForm({ contactId, onAdded }: { contactId: string; onAdded: () => void }) {
  const { user } = useSession()
  const [type, setType] = useState<ActivityType>('note')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const text = body.trim()
    if (!text) return
    setSaving(true)
    try {
      await repository.addActivity({
        contactId,
        type,
        occurredAt: new Date().toISOString(),
        authorId: user.id,
        authorName: user.name,
        body: text,
      })
      setBody('')
      onAdded()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
      <div className="flex flex-wrap gap-1">
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
                'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors',
                active
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3" /> {label}
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
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">wird als {user.name} gespeichert</span>
        <Button size="sm" onClick={submit} disabled={!body.trim() || saving}>
          {saving ? 'Speichern…' : 'Eintrag speichern'}
        </Button>
      </div>
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
  const [text, setText] = useState('')
  const [due, setDue] = useState('')

  const add = async () => {
    if (!text.trim() || !due) return
    await repository.addReminder({ contactId, dueDate: due, text: text.trim(), createdByName: user.name })
    setText('')
    setDue('')
    onChanged()
  }
  const toggle = async (r: Reminder) => {
    await repository.toggleReminder(r.id, !r.done)
    onChanged()
  }
  const remove = async (id: string) => {
    await repository.deleteReminder(id)
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
                    <span>{formatDate(r.dueDate)}</span>
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Woran erinnern?"
          className="flex-1"
        />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="sm:w-36" />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!text.trim() || !due}>
          <Plus className="size-4" /> Reminder
        </Button>
      </div>
    </div>
  )
}

function ActivityItem({ activity, canBody }: { activity: Activity; canBody: boolean }) {
  const [open, setOpen] = useState(false)
  const { label, icon: Icon } = ACTIVITY_META[activity.type]
  // Redacted tier must NEVER see the raw body — when no AI summary exists,
  // show a placeholder rather than falling back to the confidential text.
  const summary = canBody
    ? activity.aiSummary || activity.body
    : activity.aiSummary || 'Für Ihre Rolle nur als KI-Zusammenfassung sichtbar — noch keine vorhanden.'
  const hasMore = Boolean(activity.body && activity.aiSummary && activity.body !== activity.aiSummary)

  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-1 text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <span>·</span>
        <span>{formatDateTime(activity.occurredAt)}</span>
        <span>·</span>
        <span>von {activity.authorName}</span>
      </div>
      <p className="mt-0.5 text-sm text-foreground">{summary}</p>

      {canBody
        ? hasMore && (
            <>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
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
    </li>
  )
}

function SentimentItem({ entry }: { entry: SentimentEntry }) {
  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-1.5">
        <TrafficLightDot value={entry.value} />
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Status geändert</span>
        <span>·</span>
        <span>{formatDateTime(entry.at)}</span>
        {entry.byName && (
          <>
            <span>·</span>
            <span>von {entry.byName}</span>
          </>
        )}
      </div>
      <p className="mt-0.5 text-sm text-foreground">Beziehung auf „{TRAFFIC_LABEL[entry.value]}“ gesetzt.</p>
    </li>
  )
}
