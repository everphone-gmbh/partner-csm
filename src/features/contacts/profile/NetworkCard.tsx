import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, Waypoints } from 'lucide-react'
import type { Contact, ContactLinkKind } from '@/domain/types'
import { describeLink, LINK_KIND_OPTIONS } from '@/domain/contactLinks'
import { repository } from '@/data/repositoryProvider'
import { useRepoQuery } from '@/app/useRepoQuery'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { NetworkGraph } from './NetworkGraph'
import { selectCls } from './shared'

/**
 * The Beziehungsnetz card: who this contact reports to, knows, or influences.
 * Links are stored once and rendered from both endpoints' viewpoints.
 */
export function NetworkCard({ contact, canEdit }: { contact: Contact; canEdit: boolean }) {
  const { toast } = useToast()
  const [mode, setMode] = useState<'graph' | 'list'>('graph')
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState<ContactLinkKind>('knows')
  const [otherId, setOtherId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const { data, loading, error, retry } = useRepoQuery(
    () => Promise.all([repository.listContactLinks(contact.id), repository.listContacts()]),
    [contact.id],
  )
  const links = data?.[0] ?? []
  const contacts = data?.[1] ?? []
  const byId = new Map(contacts.map((c) => [c.id, c]))
  const candidates = contacts.filter(
    (c) => c.id !== contact.id && !links.some((l) => describeLink(l, contact.id)?.otherContactId === c.id),
  )

  const add = async () => {
    if (!otherId) return
    setSaving(true)
    try {
      await repository.addContactLink({
        fromContactId: contact.id,
        toContactId: otherId,
        kind,
        note: note.trim() || undefined,
      })
      setOtherId('')
      setNote('')
      setAdding(false)
      retry()
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (linkId: string) => {
    try {
      await repository.deleteContactLink(linkId)
    } catch (err) {
      toast(saveErrorMessage(err))
      return
    }
    retry()
  }

  const rows = links
    .map((l) => ({ link: l, view: describeLink(l, contact.id) }))
    .filter((r): r is { link: (typeof links)[number]; view: NonNullable<ReturnType<typeof describeLink>> } =>
      Boolean(r.view),
    )

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Waypoints className="size-4 text-muted-foreground" /> Netzwerk
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-full bg-secondary p-0.5">
            {(['graph', 'list'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs transition-colors',
                  mode === m ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground',
                )}
              >
                {m === 'graph' ? 'Graph' : 'Liste'}
              </button>
            ))}
          </div>
          {canEdit && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" /> Verknüpfen
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="text-sm text-muted-foreground">
            Netzwerk konnte nicht geladen werden.{' '}
            <button type="button" onClick={retry} className="text-primary hover:underline">
              Erneut versuchen
            </button>
          </p>
        )}
        {!error && !loading && rows.length === 0 && contact.customers.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">
            Noch keine Verknüpfungen — wer kennt {contact.fullName.split(' ')[0]}?
          </p>
        )}
        {mode === 'graph' && !loading && (rows.length > 0 || contact.customers.length > 0) && (
          <NetworkGraph contact={contact} links={links} contactsById={byId} />
        )}
        {mode === 'list' && rows.length > 0 && (
          <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
            {rows.map(({ link, view }) => {
              const other = byId.get(view.otherContactId)
              return (
                <li key={link.id} className="flex items-center gap-3 py-2">
                  <Avatar src={other?.photoUrl} name={other?.fullName ?? '?'} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      <span className="text-muted-foreground">{view.label} </span>
                      <Link
                        to={`/contacts/${view.otherContactId}`}
                        className="font-medium hover:underline"
                      >
                        {other?.fullName ?? 'Unbekannter Kontakt'}
                      </Link>
                    </div>
                    {link.note && (
                      <div className="truncate text-xs text-muted-foreground">{link.note}</div>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => remove(link.id)}
                      aria-label="Verknüpfung entfernen"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {adding && (
          <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                className={`${selectCls} sm:w-40`}
                value={kind}
                onChange={(e) => setKind(e.target.value as ContactLinkKind)}
              >
                {LINK_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                className={`${selectCls} flex-1`}
                value={otherId}
                onChange={(e) => setOtherId(e.target.value)}
              >
                <option value="">Kontakt wählen…</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                  </option>
                ))}
              </select>
            </div>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Notiz (optional, z. B. „kennen sich von der Digital X“)"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Abbrechen
              </Button>
              <Button size="sm" onClick={add} disabled={!otherId || saving}>
                {saving ? 'Speichern…' : 'Verknüpfen'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
