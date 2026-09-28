import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { GiftOccasion, GiftProduct, GiftRecipient } from '@/domain/types'
import { GIFT_STATUSES } from '@/domain/types'
import { distinctCompanies, giftFunnel, GIFT_STATUS_LABEL } from '@/domain/gifts'
import { repository } from '@/data/repositoryProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { GIFT_STATUS_BAR } from './giftUi'

/**
 * Kopf eines Anlasses wie im Mockup: Stichtag, Zahl der Geschenke und Firmen,
 * der Trichter geplant → bestellt → versandt → zugestellt und die Produkte mit
 * ihrer Stückzahl.
 */
export function OccasionCard({
  occasion,
  recipients,
  products,
  onEdit,
  onChanged,
}: {
  occasion: GiftOccasion
  recipients: GiftRecipient[]
  products: GiftProduct[]
  onEdit: () => void
  onChanged: () => void
}) {
  const funnel = giftFunnel(recipients)
  const total = recipients.length
  const companies = distinctCompanies(recipients)

  return (
    <Card>
      <CardContent className="space-y-4 pt-5 sm:pt-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold">{occasion.name}</h2>
          {occasion.shipBy && (
            <span className="text-xs text-muted-foreground">Versand bis {formatDate(occasion.shipBy)}</span>
          )}
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {total} {total === 1 ? 'Geschenk' : 'Geschenke'} · {companies} {companies === 1 ? 'Firma' : 'Firmen'}
          </span>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Anlass bearbeiten"
            title="Anlass bearbeiten"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="Stand der Geschenke">
          {GIFT_STATUSES.map((s) => (
            <div key={s} className="rounded-xl border border-border bg-background px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {GIFT_STATUS_LABEL[s]}
              </div>
              <div className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{funnel[s]}</div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
                <div
                  className={cn('h-full rounded-full', GIFT_STATUS_BAR[s])}
                  style={{ width: `${total ? Math.round((funnel[s] / total) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <ProductGrid occasionId={occasion.id} products={products} recipients={recipients} onChanged={onChanged} />
      </CardContent>
    </Card>
  )
}

function ProductGrid({
  occasionId,
  products,
  recipients,
  onChanged,
}: {
  occasionId: string
  products: GiftProduct[]
  recipients: GiftRecipient[]
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ emoji: '', name: '', description: '' })
  const [saving, setSaving] = useState(false)

  const count = (id: string) => recipients.filter((r) => r.productId === id).length

  const startAdd = () => {
    setEditingId(null)
    setForm({ emoji: '🎁', name: '', description: '' })
    setAdding(true)
  }
  const startEdit = (p: GiftProduct) => {
    setAdding(false)
    setForm({ emoji: p.emoji ?? '', name: p.name, description: p.description ?? '' })
    setEditingId(p.id)
  }
  const cancel = () => {
    setAdding(false)
    setEditingId(null)
  }

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        await repository.updateGiftProduct(editingId, {
          name: form.name,
          emoji: form.emoji || null,
          description: form.description || null,
        })
      } else {
        await repository.createGiftProduct({ occasionId, ...form })
      }
      cancel()
      onChanged()
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: GiftProduct) => {
    const n = count(p.id)
    const msg =
      n > 0
        ? `„${p.name}" löschen? ${n} Empfänger bleiben in der Liste, nur ohne Produkt.`
        : `„${p.name}" löschen?`
    if (!window.confirm(msg)) return
    try {
      await repository.deleteGiftProduct(p.id)
      onChanged()
    } catch (err) {
      toast(saveErrorMessage(err))
    }
  }

  const productForm = (
    <div className="space-y-2 rounded-xl border border-border bg-background p-3 sm:col-span-2">
      <div className="flex gap-2">
        <Input
          value={form.emoji}
          onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
          aria-label="Symbol"
          className="w-14 text-center"
          maxLength={4}
        />
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Produkt, z. B. Schokolade"
          aria-label="Produktname"
          autoFocus
        />
      </div>
      <Input
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        placeholder="Beschreibung (optional)"
        aria-label="Beschreibung"
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={saving || !form.name.trim()}>
          {saving ? 'Speichern…' : 'Speichern'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={saving}>
          Abbrechen
        </Button>
      </div>
    </div>
  )

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) =>
        editingId === p.id ? (
          <div key={p.id} className="contents">
            {productForm}
          </div>
        ) : (
          <div key={p.id} className="group flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg" aria-hidden>
              {p.emoji || '🎁'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{p.name}</div>
              {p.description && <div className="truncate text-xs text-muted-foreground">{p.description}</div>}
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(p)}
                  aria-label={`${p.name} bearbeiten`}
                  className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(p)}
                  aria-label={`${p.name} löschen`}
                  className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
            <span className="text-base font-semibold tabular-nums">{count(p.id)}</span>
          </div>
        ),
      )}
      {adding ? (
        productForm
      ) : (
        <button
          type="button"
          onClick={startAdd}
          className="flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-left text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary">
            <Plus className="size-4" />
          </span>
          <span>
            <span className="block text-sm font-medium">Produkt hinzufügen</span>
            <span className="block text-xs">für diesen Anlass</span>
          </span>
        </button>
      )}
    </div>
  )
}
