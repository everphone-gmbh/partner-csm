import { Link } from 'react-router-dom'
import type { Contact } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useRepoQuery } from '@/app/useRepoQuery'
import { GIFT_STATUS_LABEL } from '@/domain/gifts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/format'

/**
 * Welche Geschenke hat diese Person bekommen? Erscheint nur, wenn es welche gibt
 * (Mockup: „Ist ein Empfänger mit einem Kontakt verknüpft, erscheint dort eine
 * neue Karte"). Damit sieht man vor dem Gespräch, ob und was jemand zuletzt
 * bekommen hat. Nur ab Relationship Manager — die Geschenktabellen sind für
 * Account Manager ohnehin gesperrt (0036); ContactProfile blendet die Karte aus.
 */
export function GeschenkeCard({ contact }: { contact: Contact }) {
  const q = useRepoQuery(
    () =>
      Promise.all([
        repository.listContactGifts(contact.id),
        repository.listGiftOccasions(),
        repository.listGiftProducts(),
        repository.listGiftSenders(),
      ]),
    [contact.id],
  )
  if (!q.data) return null
  const [gifts, occasions, products, senders] = q.data
  if (gifts.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Geschenke</CardTitle>
        <Link to="/gifts" className="text-xs text-muted-foreground hover:text-foreground">
          Alle Geschenke
        </Link>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {gifts.map((g) => {
            const occasion = occasions.find((o) => o.id === g.occasionId)
            const product = products.find((p) => p.id === g.productId)
            const from = senders.filter((s) => g.senderIds.includes(s.id)).map((s) => s.name)
            const year = (g.statusAt ?? g.createdAt).slice(0, 4)
            const status =
              g.status === 'zugestellt' && g.statusAt
                ? `zugestellt ${formatDate(g.statusAt).slice(0, 6)}`
                : GIFT_STATUS_LABEL[g.status].toLowerCase()
            return (
              <li key={g.id} className="flex gap-3 py-2.5 first:pt-0">
                <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{year}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {product ? `${product.emoji ? `${product.emoji} ` : ''}${product.name}` : 'Geschenk'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[occasion?.name, status, from.length ? `von ${from.join(', ')}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
