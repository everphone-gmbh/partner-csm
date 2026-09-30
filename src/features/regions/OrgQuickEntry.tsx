import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import type { Contact, HierarchyLevel } from '@/domain/types'
import { HIERARCHY_LEVELS } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { contactRegionIds, isInRegion } from '@/domain/contactRegions'
import { HIERARCHY_LABEL } from '@/domain/orgChart'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { FieldHint } from '@/components/ui/notice'
import { useMissingHint } from '@/lib/useMissingHint'
import { selectCls } from '@/features/contacts/profile/shared'
import { cn } from '@/lib/utils'

/**
 * Schnell-Eintrag (Entscheidung 2026-09-03): meist wird ein VORHANDENER Kontakt
 * eingeordnet — Ebene setzen, optional „berichtet an", und falls er noch nicht
 * zur Region gehört, kommt sie hinzu (seit 0035 kann ein Kontakt mehrere
 * haben). Neu anlegen geht über den Link daneben.
 */
export function OrgQuickEntry({
  regionId,
  regionContacts,
  allContacts,
  onDone,
}: {
  regionId: string
  regionContacts: Contact[]
  allContacts: Contact[]
  onDone: () => void
}) {
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Contact | null>(null)
  const [level, setLevel] = useState<HierarchyLevel>('management')
  const [managerId, setManagerId] = useState('')
  const [saving, setSaving] = useState(false)
  const pickHint = useMissingHint()

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return allContacts
      .filter((c) => `${c.fullName} ${c.position} ${c.company ?? ''}`.toLowerCase().includes(q))
      // Wer schon in der Region steht, zuerst — das ist der häufige Fall.
      .sort((a, b) => Number(isInRegion(b, regionId)) - Number(isInRegion(a, regionId)))
      .slice(0, 6)
  }, [query, allContacts, regionId])

  const pick = (c: Contact) => {
    setPicked(c)
    setQuery('')
    if (c.hierarchyLevel) setLevel(c.hierarchyLevel)
  }

  const save = async () => {
    if (!pickHint.check(!picked) || !picked) return
    setSaving(true)
    try {
      const joins = !isInRegion(picked, regionId)
      await repository.updateContact(picked.id, {
        hierarchyLevel: level,
        ...(joins ? { regionIds: [...contactRegionIds(picked), regionId] } : {}),
      })
      // „berichtet an": vorhandene Linien dieses Kontakts zu Personen DIESER
      // Region ersetzen; Führungskräfte in anderen Regionen bleiben unberührt.
      const inRegion = new Set(regionContacts.map((c) => c.id))
      const existing = (await repository.listContactLinks(picked.id)).filter(
        (l) => l.kind === 'reports_to' && l.fromContactId === picked.id && inRegion.has(l.toContactId),
      )
      if (managerId && !existing.some((l) => l.toContactId === managerId)) {
        for (const l of existing) await repository.deleteContactLink(l.id)
        await repository.addContactLink({ fromContactId: picked.id, toContactId: managerId, kind: 'reports_to' })
      } else if (!managerId) {
        for (const l of existing) await repository.deleteContactLink(l.id)
      }
      toast(`${picked.fullName} eingeordnet: ${HIERARCHY_LABEL[level]}.`, 'success')
      setPicked(null)
      setManagerId('')
      onDone()
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const managers = regionContacts.filter((c) => c.id !== picked?.id)

  return (
    <Card>
      <CardContent className="space-y-3 pt-5 sm:pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Einordnen</h2>
          <Link to="/contacts/new" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <UserPlus className="size-3.5" /> Neuen Kontakt anlegen
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1.5fr_auto]">
          <div className="relative">
            {picked ? (
              <div className="flex h-9 items-center gap-2 rounded-[10px] bg-secondary px-3 text-sm">
                <span className="flex-1 truncate font-medium">{picked.fullName}</span>
                {!isInRegion(picked, regionId) && (
                  <span className="shrink-0 text-[11px] text-teal">kommt in diese Region</span>
                )}
                <button type="button" onClick={() => setPicked(null)} className="text-xs text-muted-foreground hover:text-foreground">
                  ändern
                </button>
              </div>
            ) : (
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Kontakt suchen …"
                aria-label="Kontakt zum Einordnen"
              />
            )}
            {hits.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                {hits.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => pick(c)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                    >
                      {c.fullName}
                      <span className="text-muted-foreground">
                        {c.position ? ` · ${c.position}` : ''}
                        {isInRegion(c, regionId) ? '' : ' · andere Region'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <select
            aria-label="Ebene"
            className={selectCls}
            value={level}
            onChange={(e) => setLevel(e.target.value as HierarchyLevel)}
          >
            {HIERARCHY_LEVELS.map((l) => (
              <option key={l} value={l}>
                {HIERARCHY_LABEL[l]}
              </option>
            ))}
          </select>
          <select
            aria-label="berichtet an"
            className={cn(selectCls)}
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
          >
            <option value="">berichtet an … (optional)</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
                {m.hierarchyLevel ? ` · ${HIERARCHY_LABEL[m.hierarchyLevel]}` : ''}
              </option>
            ))}
          </select>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? 'Ordnet ein…' : 'Einordnen'}
          </Button>
        </div>
        {pickHint.tried && !picked && (
          <FieldHint className="mt-2">Such zuerst einen Kontakt und wähle ihn aus der Liste.</FieldHint>
        )}
      </CardContent>
    </Card>
  )
}
