import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Link2 } from 'lucide-react'
import type { GiftProduct, GiftRecipient, GiftSender, GiftStatus } from '@/domain/types'
import { GIFT_STATUSES } from '@/domain/types'
import {
  filterRecipients,
  GIFT_SHIPPING_LABEL,
  GIFT_STATUS_LABEL,
  isAddressMissing,
  recipientName,
  sortRecipients,
  sortSenders,
  type RecipientFilter,
} from '@/domain/gifts'
import { repository } from '@/data/repositoryProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { selectCls } from '@/features/contacts/profile/shared'
import { cn } from '@/lib/utils'
import { SenderChips, StatusSelect } from './giftUi'

/**
 * Die Empfängerliste eines Anlasses: filtern nach Produkt, Absender und Status,
 * Status direkt in der Zeile umstellen, mehrere auf einmal weiterschalten.
 * Mit ein paar hundert Zeilen wäre jeder Status einzeln zu klicken der Grund,
 * doch wieder das Sheet zu nehmen.
 */
export function RecipientTable({
  recipients,
  products,
  senders,
  onEdit,
  onChanged,
}: {
  recipients: GiftRecipient[]
  products: GiftProduct[]
  senders: GiftSender[]
  onEdit: (r: GiftRecipient) => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [filter, setFilter] = useState<RecipientFilter>({})
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [bulkStatus, setBulkStatus] = useState<GiftStatus>('bestellt')
  const [busy, setBusy] = useState(false)

  const shown = useMemo(() => sortRecipients(filterRecipients(recipients, filter)), [recipients, filter])
  const productName = (id?: string) => products.find((p) => p.id === id)?.name
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.id))

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const changeStatus = async (r: GiftRecipient, status: GiftStatus) => {
    try {
      await repository.updateGiftRecipient(r.id, { status })
      onChanged()
    } catch (err) {
      toast(saveErrorMessage(err))
    }
  }

  const applyBulk = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    if (ids.length > 25 && !window.confirm(`${ids.length} Geschenke auf „${GIFT_STATUS_LABEL[bulkStatus]}" setzen?`)) {
      return
    }
    setBusy(true)
    try {
      const n = await repository.setGiftStatus(ids, bulkStatus)
      toast(`${n} ${n === 1 ? 'Geschenk' : 'Geschenke'} auf „${GIFT_STATUS_LABEL[bulkStatus]}" gesetzt.`, 'success')
      setSelected(new Set())
      onChanged()
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5 sm:pt-5">
        <div className="flex flex-wrap items-end gap-2">
          <h3 className="mr-auto text-sm font-semibold">Empfänger</h3>
          <Input
            value={filter.query ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
            placeholder="Name, Firma, Ort …"
            aria-label="Empfänger suchen"
            className="h-9 w-44"
          />
          <select
            aria-label="Nach Produkt filtern"
            className={cn(selectCls, 'h-9 w-auto')}
            value={filter.productId ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, productId: e.target.value || undefined }))}
          >
            <option value="">alle Produkte</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Nach Absender filtern"
            className={cn(selectCls, 'h-9 w-auto')}
            value={filter.senderId ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, senderId: e.target.value || undefined }))}
          >
            <option value="">alle Absender</option>
            {sortSenders(senders).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Nach Status filtern"
            className={cn(selectCls, 'h-9 w-auto')}
            value={filter.status ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, status: (e.target.value || undefined) as GiftStatus | undefined }))}
          >
            <option value="">alle Status</option>
            {GIFT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {GIFT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <span className="font-medium">
              {selected.size} ausgewählt
            </span>
            <span className="text-muted-foreground">Status setzen:</span>
            <select
              aria-label="Neuer Status für die Auswahl"
              className={cn(selectCls, 'h-8 w-auto')}
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value as GiftStatus)}
            >
              {GIFT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {GIFT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" onClick={applyBulk} disabled={busy}>
              {busy ? 'Übernimmt…' : 'Übernehmen'}
            </Button>
            <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
              Auswahl aufheben
            </button>
          </div>
        )}

        {recipients.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Noch keine Empfänger. Über „+ Empfänger" einzeln anlegen oder eine Liste importieren.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 pb-2">
                    <input
                      type="checkbox"
                      aria-label="Alle angezeigten auswählen"
                      checked={allShownSelected}
                      onChange={() =>
                        setSelected(allShownSelected ? new Set() : new Set(shown.map((r) => r.id)))
                      }
                      className="size-4 accent-[var(--primary)]"
                    />
                  </th>
                  <th className="px-2 pb-2">Empfänger</th>
                  <th className="px-2 pb-2">Produkt</th>
                  <th className="px-2 pb-2">Absender</th>
                  <th className="px-2 pb-2">Versandweg</th>
                  <th className="px-2 pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top hover:bg-secondary/50">
                    <td className="py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`${recipientName(r)} auswählen`}
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        className="size-4 accent-[var(--primary)]"
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <button type="button" onClick={() => onEdit(r)} className="text-left font-semibold hover:underline">
                        {recipientName(r)}
                      </button>
                      <div className="text-xs text-muted-foreground">
                        {[r.company, r.city].filter(Boolean).join(' · ') || '—'}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.contactId ? (
                          <Link
                            to={`/contacts/${r.contactId}`}
                            className="inline-flex items-center gap-1 rounded-full bg-teal/10 px-2 py-0.5 text-[11px] font-semibold text-teal hover:underline"
                          >
                            <Link2 className="size-3" /> Kontakt verknüpft
                          </Link>
                        ) : (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                            nur in dieser Liste
                          </span>
                        )}
                        {isAddressMissing(r) && (
                          <span className="rounded-full bg-status-amber/15 px-2 py-0.5 text-[11px] font-semibold text-status-amber">
                            Adresse fehlt
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">{productName(r.productId) ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2 py-2.5">
                      <SenderChips ids={r.senderIds} senders={senders} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-xs text-muted-foreground">
                      {GIFT_SHIPPING_LABEL[r.shipping]}
                    </td>
                    <td className="px-2 py-2.5">
                      <StatusSelect
                        value={r.status}
                        onChange={(s) => void changeStatus(r, s)}
                        label={`Status von ${recipientName(r)}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {recipients.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {shown.length} von {recipients.length} · nach Firma sortiert
          </p>
        )}
      </CardContent>
    </Card>
  )
}
