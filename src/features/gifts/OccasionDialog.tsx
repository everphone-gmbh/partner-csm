import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { GiftOccasion, GiftOccasionKind } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { FieldHint } from '@/components/ui/notice'
import { useConfirm } from '@/components/ui/useConfirm'
import { useMissingHint } from '@/lib/useMissingHint'
import { selectCls } from '@/features/contacts/profile/shared'

/**
 * Anlass anlegen oder bearbeiten. Geburtstage sind kein wählbarer Typ: der
 * laufende Geburtstags-Anlass entsteht von selbst beim ersten „Geschenk planen".
 */
export function OccasionDialog({
  occasion,
  recipientCount = 0,
  onClose,
  onSaved,
}: {
  occasion?: GiftOccasion
  recipientCount?: number
  onClose: () => void
  onSaved: (occasion?: GiftOccasion) => void
}) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const nameHint = useMissingHint()
  const [name, setName] = useState(occasion?.name ?? `Weihnachten ${new Date().getFullYear()}/${String(new Date().getFullYear() + 1).slice(2)}`)
  const [kind, setKind] = useState<GiftOccasionKind>(occasion?.kind ?? 'weihnachten')
  const [shipBy, setShipBy] = useState(occasion?.shipBy ?? '')
  const [saving, setSaving] = useState(false)
  const isBirthday = occasion?.kind === 'geburtstag'

  const save = async () => {
    if (!nameHint.check(!name.trim())) return
    setSaving(true)
    try {
      const saved = occasion
        ? await repository.updateGiftOccasion(occasion.id, { name, shipBy: shipBy || null })
        : await repository.createGiftOccasion({ name, kind, shipBy: shipBy || undefined })
      toast(occasion ? 'Anlass gespeichert.' : 'Anlass angelegt.', 'success')
      onSaved(saved)
    } catch (err) {
      toast(saveErrorMessage(err))
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!occasion) return
    const ok = await confirm({
      title: `„${occasion.name}“ löschen?`,
      message:
        recipientCount > 0
          ? `Die ${recipientCount} Empfänger und alle Produkte dieses Anlasses werden mitgelöscht. Das lässt sich nicht rückgängig machen.`
          : 'Das lässt sich nicht rückgängig machen.',
      confirmLabel: 'Anlass löschen',
      cancelLabel: 'Behalten',
      tone: 'danger',
    })
    if (!ok) return
    setSaving(true)
    try {
      await repository.deleteGiftOccasion(occasion.id)
      toast('Anlass gelöscht.', 'success')
      onSaved()
    } catch (err) {
      toast(saveErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={occasion ? 'Anlass bearbeiten' : 'Neuer Anlass'}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          {occasion && !isBirthday && (
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
      <div className="space-y-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Name
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={(nameHint.tried && !name.trim()) || undefined} />
          {nameHint.tried && !name.trim() && <FieldHint>Gib dem Anlass einen Namen.</FieldHint>}
        </label>
        {!occasion && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Art
            <select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as GiftOccasionKind)}>
              <option value="weihnachten">Weihnachten</option>
              <option value="sonstiges">Sonstiges (Jubiläum, Dankeschön …)</option>
            </select>
          </label>
        )}
        {!isBirthday && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Versand bis
            <Input type="date" value={shipBy} onChange={(e) => setShipBy(e.target.value)} />
          </label>
        )}
      </div>
    </Modal>
  )
}
