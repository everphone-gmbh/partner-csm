import { useState } from 'react'
import { Building2, ExternalLink, Plus, X } from 'lucide-react'
import type { Contact, CustomerLink } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'
import { safeHttpsUrl } from '@/domain/urls'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { selectCls } from './shared'

/**
 * Customer mapping per contact (mit uns / ohne uns = Potenzial), manually
 * maintainable by RM+ — Feedback-Runde KW 28. Salesforce sync will later
 * populate this automatically; manual entries carry an optional SF deeplink.
 */
export function KundenCard({
  contact,
  canEdit,
  onSave,
}: {
  contact: Contact
  canEdit: boolean
  onSave: (patch: ContactPatch) => Promise<void>
}) {
  const customers = contact.customers
  const withUs = customers.filter((c) => c.withUs)
  const withoutUs = customers.filter((c) => !c.withUs)

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [side, setSide] = useState<'with' | 'without'>('with')
  const [sfUrl, setSfUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const add = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const next: CustomerLink = {
        id: crypto.randomUUID(),
        name: name.trim(),
        withUs: side === 'with',
        salesforceUrl: safeHttpsUrl(sfUrl) ?? undefined,
      }
      await onSave({ customers: [...customers, next] })
      setName('')
      setSfUrl('')
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  const remove = (customerId: string) =>
    void onSave({ customers: customers.filter((c) => c.id !== customerId) })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Kunden</CardTitle>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3.5" /> Kunde
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <CustomerGroup title="Mit uns" customers={withUs} canEdit={canEdit} onRemove={remove} />
        <CustomerGroup
          title="Ohne uns (Potenzial)"
          customers={withoutUs}
          canEdit={canEdit}
          onRemove={remove}
        />
        {customers.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">Keine Kunden zugeordnet.</p>
        )}
        {adding && (
          <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Kundenname"
                className="flex-1"
              />
              <select
                className={`${selectCls} sm:w-44`}
                value={side}
                onChange={(e) => setSide(e.target.value as 'with' | 'without')}
              >
                <option value="with">Mit uns</option>
                <option value="without">Ohne uns (Potenzial)</option>
              </select>
            </div>
            <Input
              type="url"
              value={sfUrl}
              onChange={(e) => setSfUrl(e.target.value)}
              placeholder="Salesforce-Link (optional, https://…)"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Abbrechen
              </Button>
              <Button size="sm" onClick={add} disabled={!name.trim() || saving}>
                {saving ? 'Speichern…' : 'Hinzufügen'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CustomerGroup({
  title,
  customers,
  canEdit,
  onRemove,
}: {
  title: string
  customers: CustomerLink[]
  canEdit: boolean
  onRemove: (id: string) => void
}) {
  if (customers.length === 0) return null
  return (
    <div className="space-y-1.5">
      <Label>{title}</Label>
      <div className="space-y-1.5">
        {customers.map((c) => {
          const sfUrl = safeHttpsUrl(c.salesforceUrl)
          return (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <span className="inline-flex min-w-0 items-center gap-2 text-sm">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{c.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {sfUrl && (
                  <a
                    href={sfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Salesforce <ExternalLink className="size-3" />
                  </a>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onRemove(c.id)}
                    aria-label="Kunde entfernen"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
