import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { GiftSender } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { sortSenders } from '@/domain/gifts'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { FieldHint } from '@/components/ui/notice'
import { useConfirm } from '@/components/ui/useConfirm'
import { useMissingHint } from '@/lib/useMissingHint'

/**
 * Die Absenderliste pflegen: umbenennen, als C-Level markieren (dann steht der
 * Absender in jeder neuen Zeile schon drin), entfernen. Absender sind meist
 * keine Tool-Nutzer — deshalb eine eigene Liste statt der Konten.
 */
export function SendersDialog({
  senders,
  usage,
  onClose,
  onChanged,
}: {
  senders: GiftSender[]
  /** Wie oft ein Absender vorkommt — steht beim Löschen in der Rückfrage. */
  usage: Map<string, number>
  onClose: () => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const addHint = useMissingHint()
  const [list, setList] = useState(() => sortSenders(senders))
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(senders.map((s) => [s.id, s.name])),
  )
  const [newName, setNewName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const replace = (s: GiftSender) => {
    setList((prev) => sortSenders(prev.map((p) => (p.id === s.id ? s : p))))
    onChanged()
  }

  const rename = async (s: GiftSender) => {
    const name = names[s.id]?.trim()
    if (!name || name === s.name) return
    setBusyId(s.id)
    try {
      replace(await repository.updateGiftSender(s.id, { name }))
    } catch (err) {
      toast(saveErrorMessage(err))
      setNames((prev) => ({ ...prev, [s.id]: s.name }))
    } finally {
      setBusyId(null)
    }
  }

  const toggleCLevel = async (s: GiftSender) => {
    setBusyId(s.id)
    try {
      replace(await repository.updateGiftSender(s.id, { isCLevel: !s.isCLevel }))
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (s: GiftSender) => {
    const n = usage.get(s.id) ?? 0
    const ok = await confirm({
      title: `„${s.name}“ entfernen?`,
      message:
        n > 0
          ? `Steht bei ${n} Geschenken als Absender; dort fällt der Name weg.`
          : 'Das lässt sich nicht rückgängig machen.',
      confirmLabel: 'Absender entfernen',
      cancelLabel: 'Behalten',
      tone: 'danger',
    })
    if (!ok) return
    setBusyId(s.id)
    try {
      await repository.deleteGiftSender(s.id)
      setList((prev) => prev.filter((p) => p.id !== s.id))
      onChanged()
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const add = async () => {
    const name = newName.trim()
    if (!addHint.check(!name)) return
    try {
      const s = await repository.createGiftSender(name)
      setList((prev) => (prev.some((p) => p.id === s.id) ? prev : sortSenders([...prev, s])))
      setNames((prev) => ({ ...prev, [s.id]: s.name }))
      setNewName('')
      onChanged()
    } catch (err) {
      toast(saveErrorMessage(err))
    }
  }

  return (
    <Modal
      title="Absender"
      description="C-Level steht in jeder neuen Zeile schon als Absender drin."
      onClose={onClose}
      footer={
        <Button type="button" onClick={onClose}>
          Fertig
        </Button>
      }
    >
      <ul className="divide-y divide-border">
        {list.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-2">
            <Input
              value={names[s.id] ?? s.name}
              onChange={(e) => setNames((prev) => ({ ...prev, [s.id]: e.target.value }))}
              onBlur={() => void rename(s)}
              aria-label={`Name von ${s.name}`}
              className="h-9 flex-1"
              disabled={busyId === s.id}
            />
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={s.isCLevel}
                onChange={() => void toggleCLevel(s)}
                disabled={busyId === s.id}
                className="size-4 accent-[var(--primary)]"
              />
              C-Level
            </label>
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground" title="Geschenke mit diesem Absender">
              {usage.get(s.id) ?? 0}
            </span>
            <button
              type="button"
              onClick={() => void remove(s)}
              disabled={busyId === s.id}
              aria-label={`${s.name} entfernen`}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
        {list.length === 0 && (
          <li className="py-3 text-sm text-muted-foreground">Noch keine Absender. Unten den ersten anlegen.</li>
        )}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
          }}
          placeholder="Neuer Absender"
          aria-label="Neuer Absender"
        />
        <Button type="button" variant="outline" onClick={() => void add()}>
          <Plus className="size-4" /> Hinzufügen
        </Button>
      </div>
      {addHint.tried && !newName.trim() && <FieldHint className="mt-2">Gib einen Namen ein.</FieldHint>}
    </Modal>
  )
}
