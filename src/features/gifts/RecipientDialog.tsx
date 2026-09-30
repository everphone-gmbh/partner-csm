import { useMemo, useState } from 'react'
import { Link2, Plus, Trash2, X } from 'lucide-react'
import type { Contact, GiftProduct, GiftRecipient, GiftSender, GiftShipping, GiftStatus } from '@/domain/types'
import type { GiftRecipientPatch, NewGiftRecipient } from '@/data/repository'
import { repository } from '@/data/repositoryProvider'
import { defaultSenderIds, GIFT_SHIPPING_LABEL, sortSenders } from '@/domain/gifts'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { FieldHint } from '@/components/ui/notice'
import { useConfirm } from '@/components/ui/useConfirm'
import { useMissingHint } from '@/lib/useMissingHint'
import { selectCls } from '@/features/contacts/profile/shared'
import { cn } from '@/lib/utils'
import { StatusSelect } from './giftUi'

interface Draft {
  contactId?: string
  firstName: string
  lastName: string
  company: string
  street: string
  postalCode: string
  city: string
  country: string
  productId: string
  shipping: GiftShipping
  status: GiftStatus
  note: string
  senderIds: string[]
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: '', lastName: parts[0] }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

/**
 * Empfänger anlegen oder bearbeiten.
 *
 * Zwei Wege, eine Zeile: frei eintragen (die meisten Empfänger sind keine
 * Kontakte des Tools) oder mit einem Kontakt verknüpfen — dann erscheint das
 * Geschenk auf dessen Karte. Name und Firma stehen auch bei Verknüpfung in der
 * Zeile, damit sie für sich lesbar bleibt.
 */
export function RecipientDialog({
  occasionId,
  recipient,
  prefillContact,
  products,
  senders,
  contacts,
  onClose,
  onSaved,
}: {
  occasionId: string
  /** Gesetzt = bearbeiten, sonst neu. */
  recipient?: GiftRecipient
  /** „Geschenk planen" vom Geburtstag aus: Kontakt schon verknüpft. */
  prefillContact?: Contact
  products: GiftProduct[]
  senders: GiftSender[]
  contacts: Contact[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const someoneHint = useMissingHint()
  const senderHint = useMissingHint()
  const [knownSenders, setKnownSenders] = useState(senders)
  const [draft, setDraft] = useState<Draft>(() => {
    if (recipient) {
      return {
        contactId: recipient.contactId,
        firstName: recipient.firstName ?? '',
        lastName: recipient.lastName ?? '',
        company: recipient.company ?? '',
        street: recipient.street ?? '',
        postalCode: recipient.postalCode ?? '',
        city: recipient.city ?? '',
        country: recipient.country ?? '',
        productId: recipient.productId ?? '',
        shipping: recipient.shipping,
        status: recipient.status,
        note: recipient.note ?? '',
        senderIds: recipient.senderIds,
      }
    }
    const fromContact = prefillContact
      ? { ...splitName(prefillContact.fullName), company: prefillContact.company ?? '' }
      : { firstName: '', lastName: '', company: '' }
    return {
      contactId: prefillContact?.id,
      ...fromContact,
      street: prefillContact?.businessAddress ?? '',
      postalCode: '',
      city: '',
      country: '',
      productId: products.length === 1 ? products[0].id : '',
      shipping: 'direkt',
      status: 'geplant',
      note: '',
      // C-Level steht in jeder neuen Zeile schon drin (Mockup, Absender-Hinweis).
      senderIds: defaultSenderIds(senders),
    }
  })
  const [saving, setSaving] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const [newSender, setNewSender] = useState('')

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const linked = contacts.find((c) => c.id === draft.contactId)
  const hasSomeone = Boolean(draft.firstName.trim() || draft.lastName.trim() || draft.company.trim())

  const contactHits = useMemo(() => {
    const q = contactQuery.trim().toLowerCase()
    if (q.length < 2) return []
    return contacts
      .filter((c) => `${c.fullName} ${c.company ?? ''}`.toLowerCase().includes(q))
      .slice(0, 6)
  }, [contactQuery, contacts])

  const link = (c: Contact) => {
    const names = splitName(c.fullName)
    setDraft((d) => ({
      ...d,
      contactId: c.id,
      // Nur leere Felder füllen — was schon getippt ist, bleibt.
      firstName: d.firstName || names.firstName,
      lastName: d.lastName || names.lastName,
      company: d.company || c.company || '',
      street: d.street || c.businessAddress || '',
    }))
    setContactQuery('')
  }

  const chosenSenders = sortSenders(knownSenders.filter((s) => draft.senderIds.includes(s.id)))
  const addableSenders = sortSenders(knownSenders.filter((s) => !draft.senderIds.includes(s.id)))

  const addNewSender = async () => {
    const name = newSender.trim()
    if (!senderHint.check(!name)) return
    try {
      const s = await repository.createGiftSender(name)
      setKnownSenders((prev) => (prev.some((p) => p.id === s.id) ? prev : [...prev, s]))
      setDraft((d) => (d.senderIds.includes(s.id) ? d : { ...d, senderIds: [...d.senderIds, s.id] }))
      setNewSender('')
    } catch (err) {
      toast(saveErrorMessage(err))
    }
  }

  const save = async () => {
    if (!someoneHint.check(!hasSomeone)) return
    setSaving(true)
    try {
      if (recipient) {
        const patch: GiftRecipientPatch = {
          contactId: draft.contactId ?? null,
          firstName: draft.firstName,
          lastName: draft.lastName,
          company: draft.company,
          street: draft.street,
          postalCode: draft.postalCode,
          city: draft.city,
          country: draft.country,
          productId: draft.productId || null,
          shipping: draft.shipping,
          status: draft.status,
          note: draft.note,
          senderIds: draft.senderIds,
        }
        await repository.updateGiftRecipient(recipient.id, patch)
        toast('Empfänger gespeichert.', 'success')
      } else {
        const input: NewGiftRecipient = {
          occasionId,
          contactId: draft.contactId,
          firstName: draft.firstName,
          lastName: draft.lastName,
          company: draft.company,
          street: draft.street,
          postalCode: draft.postalCode,
          city: draft.city,
          country: draft.country,
          productId: draft.productId || undefined,
          shipping: draft.shipping,
          status: draft.status,
          note: draft.note,
          senderIds: draft.senderIds,
        }
        await repository.createGiftRecipient(input)
        toast('Empfänger angelegt.', 'success')
      }
      onSaved()
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!recipient) return
    const ok = await confirm({
      title: 'Diesen Empfänger löschen?',
      message: 'Das Geschenk verschwindet aus der Liste und von der Karte des Kontakts. Das lässt sich nicht rückgängig machen.',
      confirmLabel: 'Empfänger löschen',
      cancelLabel: 'Behalten',
      tone: 'danger',
    })
    if (!ok) return
    setSaving(true)
    try {
      await repository.deleteGiftRecipient(recipient.id)
      toast('Empfänger gelöscht.', 'success')
      onSaved()
    } catch (err) {
      toast(saveErrorMessage(err))
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof Draft, placeholder?: string) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        value={draft[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        placeholder={placeholder}
      />
    </label>
  )

  return (
    <Modal
      title={recipient ? 'Empfänger bearbeiten' : 'Neuer Empfänger'}
      description="Ein Geschenk für eine Person. Mit einem Kontakt verknüpft erscheint es auf dessen Karte."
      onClose={onClose}
      busy={saving}
      wide
      footer={
        <>
          {someoneHint.tried && !hasSomeone && (
            <FieldHint className="w-full justify-end">Wähle einen Kontakt oder gib einen Namen oder eine Firma ein.</FieldHint>
          )}
          {recipient && (
            <Button type="button" variant="ghost" onClick={remove} disabled={saving} className="mr-auto text-destructive">
              <Trash2 className="size-4" /> Löschen
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? 'Speichern…' : 'Speichern'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kontakt</h3>
          {linked ? (
            <div className="flex items-center gap-2 rounded-lg bg-teal/10 px-3 py-2 text-sm">
              <Link2 className="size-4 text-teal" />
              <span className="flex-1">
                Verknüpft mit <b>{linked.fullName}</b>
                {linked.company ? ` · ${linked.company}` : ''}
              </span>
              <button
                type="button"
                onClick={() => set('contactId', undefined)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Verknüpfung lösen
              </button>
            </div>
          ) : (
            <div className="relative">
              <Input
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Mit einem Kontakt verknüpfen — Name oder Firma tippen (optional)"
                aria-label="Kontakt suchen"
              />
              {contactHits.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                  {contactHits.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => link(c)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                      >
                        {c.fullName}
                        {c.company && <span className="text-muted-foreground"> · {c.company}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {field('Vorname', 'firstName')}
          {field('Nachname', 'lastName')}
          {field('Firma', 'company')}
        </section>
        {!hasSomeone && (
          <p className="-mt-2 text-xs text-muted-foreground">Name oder Firma — eines von beiden braucht es.</p>
        )}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="sm:col-span-3">{field('Straße', 'street')}</div>
          <div className="sm:col-span-1">{field('PLZ', 'postalCode')}</div>
          <div className="sm:col-span-2">{field('Ort', 'city')}</div>
          <div className="sm:col-span-2">{field('Land', 'country', 'DE')}</div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Produkt
            <select
              className={selectCls}
              value={draft.productId}
              onChange={(e) => set('productId', e.target.value)}
            >
              <option value="">— noch offen —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji ? `${p.emoji} ` : ''}
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            Versandweg
            <div role="radiogroup" aria-label="Versandweg" className="inline-flex h-9 rounded-[10px] bg-secondary p-0.5">
              {(Object.keys(GIFT_SHIPPING_LABEL) as GiftShipping[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={draft.shipping === s}
                  onClick={() => set('shipping', s)}
                  className={cn(
                    'flex-1 rounded-[8px] px-3 text-xs font-medium',
                    draft.shipping === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {GIFT_SHIPPING_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            Status
            <div className="flex h-9 items-center">
              <StatusSelect value={draft.status} onChange={(s) => set('status', s)} />
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Absender</h3>
          <div className="flex flex-wrap gap-1.5">
            {chosenSenders.length === 0 && <span className="text-xs text-muted-foreground">Noch kein Absender.</span>}
            {chosenSenders.map((s) => (
              <span
                key={s.id}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-xs',
                  s.isCLevel ? 'bg-primary-soft font-semibold text-primary-ink' : 'bg-secondary',
                )}
              >
                {s.name}
                <button
                  type="button"
                  aria-label={`${s.name} als Absender entfernen`}
                  onClick={() => set('senderIds', draft.senderIds.filter((id) => id !== s.id))}
                  className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {addableSenders.length > 0 && (
              <select
                aria-label="Absender hinzufügen"
                className={cn(selectCls, 'w-auto')}
                value=""
                onChange={(e) => e.target.value && set('senderIds', [...draft.senderIds, e.target.value])}
              >
                <option value="">+ Absender hinzufügen …</option>
                {addableSenders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.isCLevel ? ' (C-Level)' : ''}
                  </option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-1.5">
              <Input
                value={newSender}
                onChange={(e) => setNewSender(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void addNewSender()
                  }
                }}
                placeholder="Neuer Absender"
                aria-label="Neuer Absender"
                className="w-40"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void addNewSender()}
                aria-label="Absender anlegen"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
          {senderHint.tried && !newSender.trim() && <FieldHint>Gib einen Namen für den neuen Absender ein.</FieldHint>}
        </section>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Notiz
          <Textarea value={draft.note} onChange={(e) => set('note', e.target.value)} rows={2} />
        </label>
      </div>
    </Modal>
  )
}
