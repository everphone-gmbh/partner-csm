import { Link } from 'react-router-dom'
import { Gift } from 'lucide-react'
import type { Contact, GiftRecipient } from '@/domain/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { daysUntilBirthday } from '@/lib/format'
import { StatusPill } from './giftUi'

const WINDOW_DAYS = 60

function when(days: number): string {
  if (days === 0) return 'heute'
  if (days === 1) return 'morgen'
  return `in ${days} Tagen`
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase())
    .slice(0, 2)
    .join('')
}

/**
 * Der laufende Anlass „Geburtstage", gespeist aus den Geburtstagen der Kontakte.
 * Zeigt, wer in den nächsten Wochen Geburtstag hat, und ob dafür schon etwas
 * geplant ist. Wer noch nichts hat, bekommt „Geschenk planen".
 */
export function BirthdayPanel({
  contacts,
  birthdayRecipients,
  onPlan,
}: {
  contacts: Contact[]
  birthdayRecipients: GiftRecipient[]
  onPlan: (c: Contact) => void
}) {
  const today = new Date()
  const withBirthday = contacts.filter((c) => c.birthday)
  const upcoming = withBirthday
    .map((c) => ({ contact: c, days: daysUntilBirthday(c.birthday, today) }))
    .filter((x): x is { contact: Contact; days: number } => x.days !== null && x.days <= WINDOW_DAYS)
    .sort((a, b) => a.days - b.days)

  // Schon geplant = ein Geburtstagsgeschenk für diesen Kontakt aus den letzten
  // elf Monaten. Älteres gehört zum Geburtstag im Vorjahr.
  const cutoff = today.getTime() - 330 * 86_400_000
  const planned = (contactId: string) =>
    birthdayRecipients.find((r) => r.contactId === contactId && Date.parse(r.createdAt) >= cutoff)

  return (
    <Card>
      <CardContent className="space-y-3 pt-5 sm:pt-5">
        <div>
          <h2 className="text-base font-semibold">Geburtstage</h2>
          <p className="text-xs text-muted-foreground">
            Läuft dauerhaft und wird aus den Geburtstagen der Kontakte gespeist. Heute haben{' '}
            {withBirthday.length} von {contacts.length} Kontakten ein Geburtsdatum hinterlegt.
          </p>
        </div>

        {upcoming.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            In den nächsten {WINDOW_DAYS} Tagen hat niemand Geburtstag.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map(({ contact, days }) => {
              const gift = planned(contact.id)
              return (
                <li key={contact.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground">
                    {initials(contact.fullName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/contacts/${contact.id}`} className="block truncate text-sm font-semibold hover:underline">
                      {contact.fullName}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">{contact.company ?? '—'}</span>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-primary">{when(days)}</span>
                  {gift ? (
                    <StatusPill status={gift.status} />
                  ) : (
                    <Button type="button" size="sm" variant="outline" onClick={() => onPlan(contact)}>
                      <Gift className="size-4" /> Geschenk planen
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
