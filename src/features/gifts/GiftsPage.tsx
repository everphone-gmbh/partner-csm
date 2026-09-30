import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Upload, Users } from 'lucide-react'
import type { Contact, GiftOccasion, GiftRecipient } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { useRepoQuery } from '@/app/useRepoQuery'
import { canManageGifts } from '@/domain/roles'
import { sortOccasions } from '@/domain/gifts'
import { QueryError } from '@/components/QueryError'
import { Notice } from '@/components/ui/notice'
import { Button, buttonVariants } from '@/components/ui/button'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { OccasionCard } from './OccasionCard'
import { RecipientTable } from './RecipientTable'
import { RecipientDialog } from './RecipientDialog'
import { OccasionDialog } from './OccasionDialog'
import { SendersDialog } from './SendersDialog'
import { BirthdayPanel } from './BirthdayPanel'

const BIRTHDAY_TAB = 'geburtstage'

type RecipientDialogState =
  | { occasionId: string; recipient?: GiftRecipient; prefillContact?: Contact }
  | null

/**
 * Sektion „Geschenke" (Wunsch Lennart 2026-09-22): Anlässe, Produkte und
 * Empfänger an einem Ort statt im Sheet. Gebaut nach dem abgestimmten Mockup;
 * Feedback kommt, wenn es live ist (Jannik 2026-09-28).
 *
 * Sichtbar ab Relationship Manager, innerhalb der Sektion ohne Regionsfilter.
 */
export function GiftsPage() {
  const { user } = useSession()
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const [recipientDialog, setRecipientDialog] = useState<RecipientDialogState>(null)
  const [occasionDialog, setOccasionDialog] = useState<{ occasion?: GiftOccasion } | null>(null)
  const [sendersOpen, setSendersOpen] = useState(false)
  const allowed = canManageGifts(user.role)

  const q = useRepoQuery(
    () =>
      allowed
        ? Promise.all([
            repository.listGiftOccasions(),
            repository.listGiftProducts(),
            repository.listGiftSenders(),
            repository.listGiftRecipients(),
            repository.listContacts(),
          ])
        : Promise.resolve(undefined),
    [allowed],
  )

  const [occasions, products, senders, recipients, contacts] = q.data ?? [[], [], [], [], []]
  const tabs = useMemo(() => sortOccasions(occasions).filter((o) => o.kind !== 'geburtstag'), [occasions])
  const birthday = occasions.find((o) => o.kind === 'geburtstag')
  const selectedKey = params.get('anlass') ?? tabs[0]?.id ?? BIRTHDAY_TAB
  const selected = occasions.find((o) => o.id === selectedKey && o.kind !== 'geburtstag')
  const onBirthdayTab = selectedKey === BIRTHDAY_TAB || !selected

  const byOccasion = useMemo(() => {
    const m = new Map<string, GiftRecipient[]>()
    for (const r of recipients) m.set(r.occasionId, [...(m.get(r.occasionId) ?? []), r])
    return m
  }, [recipients])
  const senderUsage = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of recipients) for (const id of r.senderIds) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }, [recipients])

  if (!allowed) {
    return (
      <Notice tone="info">Die Geschenke sind für Relationship Manager und die Leitung sichtbar.</Notice>
    )
  }

  const selectTab = (key: string) => {
    const next = new URLSearchParams(params)
    next.set('anlass', key)
    setParams(next, { replace: true })
  }

  const openCreate = async (prefillContact?: Contact) => {
    try {
      const occasionId = onBirthdayTab || prefillContact
        ? (await repository.ensureBirthdayOccasion()).id
        : selected!.id
      setRecipientDialog({ occasionId, prefillContact })
    } catch (err) {
      toast(saveErrorMessage(err))
    }
  }

  const dialogOccasionId = recipientDialog?.occasionId
  const birthdayRecipients = birthday ? (byOccasion.get(birthday.id) ?? []) : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Geschenke</h1>
          <p className="text-sm text-muted-foreground">Anlässe, Produkte und Empfänger an einem Ort</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSendersOpen(true)}>
          <Users className="size-4" /> Absender
        </Button>
        <Link to="/gifts/import" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <Upload className="size-4" /> Liste importieren
        </Link>
        <Button type="button" size="sm" onClick={() => void openCreate()} disabled={!q.data}>
          <Plus className="size-4" /> Empfänger
        </Button>
      </div>

      {q.error && <QueryError error={q.error} retry={q.retry} />}

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Anlässe">
        {tabs.map((o) => (
          <TabButton key={o.id} active={!onBirthdayTab && o.id === selected?.id} onClick={() => selectTab(o.id)}>
            {o.name} <span className="ml-1 font-normal tabular-nums">{byOccasion.get(o.id)?.length ?? 0}</span>
          </TabButton>
        ))}
        <TabButton active={onBirthdayTab} onClick={() => selectTab(BIRTHDAY_TAB)}>
          Geburtstage <span className="ml-1 font-normal">laufend</span>
        </TabButton>
        <button
          type="button"
          onClick={() => setOccasionDialog({})}
          className="inline-flex h-8 items-center rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground hover:text-foreground"
        >
          + Anlass
        </button>
      </div>

      {q.data && !onBirthdayTab && selected && (
        <>
          <OccasionCard
            occasion={selected}
            recipients={byOccasion.get(selected.id) ?? []}
            products={products.filter((p) => p.occasionId === selected.id)}
            onEdit={() => setOccasionDialog({ occasion: selected })}
            onChanged={q.retry}
          />
          <RecipientTable
            recipients={byOccasion.get(selected.id) ?? []}
            products={products.filter((p) => p.occasionId === selected.id)}
            senders={senders}
            onEdit={(r) => setRecipientDialog({ occasionId: selected.id, recipient: r })}
            onChanged={q.retry}
          />
        </>
      )}

      {q.data && onBirthdayTab && (
        <>
          <BirthdayPanel
            contacts={contacts}
            birthdayRecipients={birthdayRecipients}
            onPlan={(c) => void openCreate(c)}
          />
          {birthday && (
            <>
              <OccasionCard
                occasion={birthday}
                recipients={birthdayRecipients}
                products={products.filter((p) => p.occasionId === birthday.id)}
                onEdit={() => setOccasionDialog({ occasion: birthday })}
                onChanged={q.retry}
              />
              <RecipientTable
                recipients={birthdayRecipients}
                products={products.filter((p) => p.occasionId === birthday.id)}
                senders={senders}
                onEdit={(r) => setRecipientDialog({ occasionId: birthday.id, recipient: r })}
                onChanged={q.retry}
              />
            </>
          )}
        </>
      )}

      {recipientDialog && dialogOccasionId && (
        <RecipientDialog
          occasionId={dialogOccasionId}
          recipient={recipientDialog.recipient}
          prefillContact={recipientDialog.prefillContact}
          products={products.filter((p) => p.occasionId === dialogOccasionId)}
          senders={senders}
          contacts={contacts}
          onClose={() => setRecipientDialog(null)}
          onSaved={() => {
            setRecipientDialog(null)
            q.retry()
          }}
        />
      )}
      {occasionDialog && (
        <OccasionDialog
          occasion={occasionDialog.occasion}
          recipientCount={occasionDialog.occasion ? (byOccasion.get(occasionDialog.occasion.id)?.length ?? 0) : 0}
          onClose={() => setOccasionDialog(null)}
          onSaved={(saved) => {
            setOccasionDialog(null)
            q.retry()
            if (saved && saved.kind !== 'geburtstag') selectTab(saved.id)
            else if (!saved) selectTab(BIRTHDAY_TAB)
          }}
        />
      )}
      {sendersOpen && (
        <SendersDialog
          senders={senders}
          usage={senderUsage}
          onClose={() => setSendersOpen(false)}
          onChanged={q.retry}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // Wie die Filter überall: leises Magenta statt schwarzer Fläche.
        active
          ? 'border-transparent bg-primary-soft font-semibold text-primary-ink'
          : 'border-border bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
