import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, ExternalLink, Plus, X } from 'lucide-react'
import type { Contact, CustomerLink } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'
import { safeHttpsUrl } from '@/domain/urls'
import {
  EVERPHONE_STATUS_LABEL,
  EVERPHONE_STATUS_VARIANT,
  indexAccountsByName,
  matchAccount,
  needsAmAlignment,
  type EverphoneAccount,
} from '@/domain/everphoneAccounts'
import { repository } from '@/data/repositoryProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { selectCls } from './shared'

/**
 * Customer mapping per contact (mit uns / ohne uns = Potenzial), manually
 * maintainable by RM+ — Feedback-Runde KW 28. Salesforce sync will later
 * populate this automatically; manual entries carry an optional SF deeplink.
 *
 * Zusätzlich (Meeting 2026-07-16): Abgleich gegen die Everphone-Bestandskunden
 * aus Salesforce. Laufende Kundenbeziehungen werden markiert, damit das Team
 * vor der Ansprache mit dem zuständigen Account Manager abstimmt.
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

  // Everphone-Status der zugeordneten Kunden. Fehler bleiben still: der
  // Abgleich ist Zusatzinformation und darf die Kundenliste nicht blockieren.
  const [accounts, setAccounts] = useState<EverphoneAccount[]>([])
  const customerNames = useMemo(() => customers.map((c) => c.name), [customers])
  useEffect(() => {
    let active = true
    if (customerNames.length === 0) {
      setAccounts([])
      return
    }
    repository.matchEverphoneAccounts(customerNames).then(
      (hits) => {
        if (active) setAccounts(hits)
      },
      () => {
        if (active) setAccounts([])
      },
    )
    return () => {
      active = false
    }
  }, [customerNames])

  const accountIndex = useMemo(() => indexAccountsByName(accounts), [accounts])
  const alignmentNeeded = customers.filter((c) => {
    const match = matchAccount(c.name, accountIndex)
    return match ? needsAmAlignment(match.status) : false
  })

  // Autovervollständigung aus der Referenzliste (entprellt).
  const [suggestions, setSuggestions] = useState<EverphoneAccount[]>([])
  useEffect(() => {
    if (!adding || name.trim().length < 2) {
      setSuggestions([])
      return
    }
    let active = true
    const handle = setTimeout(() => {
      repository.searchEverphoneAccounts(name, 6).then(
        (hits) => {
          if (active) setSuggestions(hits)
        },
        () => {
          if (active) setSuggestions([])
        },
      )
    }, 200)
    return () => {
      active = false
      clearTimeout(handle)
    }
  }, [adding, name])

  const add = async (presetName?: string) => {
    const finalName = (presetName ?? name).trim()
    if (!finalName) return
    setSaving(true)
    try {
      const next: CustomerLink = {
        id: crypto.randomUUID(),
        name: finalName,
        withUs: side === 'with',
        salesforceUrl: safeHttpsUrl(sfUrl) ?? undefined,
      }
      await onSave({ customers: [...customers, next] })
      setName('')
      setSfUrl('')
      setSuggestions([])
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
        {alignmentNeeded.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-status-amber/40 bg-status-amber/10 px-3 py-2 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-amber" />
            <span>
              {alignmentNeeded.length === 1
                ? `${alignmentNeeded[0].name} ist bereits Everphone-Kunde.`
                : `${alignmentNeeded.length} dieser Kunden sind bereits Everphone-Kunden.`}{' '}
              Vor einer Ansprache mit dem zuständigen Everphone-Account-Manager abstimmen.
            </span>
          </div>
        )}
        <CustomerGroup
          title="Mit uns"
          customers={withUs}
          canEdit={canEdit}
          onRemove={remove}
          accountIndex={accountIndex}
        />
        <CustomerGroup
          title="Ohne uns (Potenzial)"
          customers={withoutUs}
          canEdit={canEdit}
          onRemove={remove}
          accountIndex={accountIndex}
        />
        {customers.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">Keine Kunden zugeordnet.</p>
        )}
        {adding && (
          <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1 space-y-1">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Kundenname"
                  autoComplete="off"
                />
                {suggestions.length > 0 && (
                  <div className="overflow-hidden rounded-md border border-border bg-card">
                    <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Aus Everphone-Salesforce
                    </div>
                    {suggestions.map((s) => (
                      <button
                        key={s.salesforceId}
                        type="button"
                        onClick={() => {
                          setName(s.name)
                          setSuggestions([])
                        }}
                        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-secondary"
                      >
                        <span className="truncate">{s.name}</span>
                        <Badge variant={EVERPHONE_STATUS_VARIANT[s.status]} className="shrink-0">
                          {EVERPHONE_STATUS_LABEL[s.status]}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <select
                className={`${selectCls} sm:w-44 sm:self-start`}
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
              <Button size="sm" onClick={() => add()} disabled={!name.trim() || saving}>
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
  accountIndex,
}: {
  title: string
  customers: CustomerLink[]
  canEdit: boolean
  onRemove: (id: string) => void
  accountIndex: Map<string, EverphoneAccount>
}) {
  if (customers.length === 0) return null
  return (
    <div className="space-y-1.5">
      <Label>{title}</Label>
      <div className="space-y-1.5">
        {customers.map((c) => {
          const sfUrl = safeHttpsUrl(c.salesforceUrl)
          const match = matchAccount(c.name, accountIndex)
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
                {match && (
                  <Badge
                    variant={EVERPHONE_STATUS_VARIANT[match.status]}
                    title={
                      match.activeRentals !== undefined
                        ? `${match.activeRentals} aktive Everphone-Geräte`
                        : undefined
                    }
                  >
                    {EVERPHONE_STATUS_LABEL[match.status]}
                    {match.activeRentals !== undefined ? ` · ${match.activeRentals}` : ''}
                  </Badge>
                )}
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
