import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Contact } from '@/domain/types'
import { birthdaysInMonth } from './dashboardStats'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/**
 * Mini month calendar marking the (scoped) contacts' birthdays. Days with a
 * birthday are tinted; clicking one opens the contact (first one on ties,
 * all names in the tooltip). Month is freely navigable.
 */
export function BirthdayCalendar({
  contacts,
  today = new Date(),
}: {
  contacts: Contact[]
  today?: Date
}) {
  const navigate = useNavigate()
  const [view, setView] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }))

  const byDay = useMemo(
    () => birthdaysInMonth(contacts, view.year, view.month),
    [contacts, view.year, view.month],
  )

  const firstOfMonth = new Date(view.year, view.month, 1)
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7 // Monday-first week
  const monthLabel = firstOfMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })

  const isToday = (day: number) =>
    today.getFullYear() === view.year && today.getMonth() === view.month && today.getDate() === day

  const step = (delta: number) =>
    setView((v) => {
      const m = v.month + delta
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 }
    })

  return (
    <div className="w-full select-none sm:w-60">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Vorheriger Monat"
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium">{monthLabel}</span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Nächster Monat"
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-1 text-[10px] font-medium uppercase text-muted-foreground">
            {d}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const celebrants = byDay.get(day)
          const marked = Boolean(celebrants?.length)
          return (
            <button
              key={day}
              type="button"
              disabled={!marked}
              title={celebrants?.map((c) => c.fullName).join(', ')}
              onClick={() => celebrants && navigate(`/contacts/${celebrants[0].id}`)}
              className={cn(
                'relative mx-auto flex size-8 items-center justify-center rounded-full text-xs tabular-nums transition-colors',
                marked
                  ? 'bg-primary/10 font-semibold text-primary hover:bg-primary/20'
                  : 'text-foreground/70',
                isToday(day) && 'ring-1 ring-primary/50',
              )}
            >
              {day}
              {marked && (
                <span className="absolute bottom-0.5 size-1 rounded-full bg-primary" aria-hidden />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
