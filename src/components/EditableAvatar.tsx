import { useRef, useState, type ChangeEvent } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { fileToResizedBlob } from '@/lib/image'
import { fileStore } from '@/lib/fileStore'
import { cn } from '@/lib/utils'

/** Avatar with a camera/upload affordance. On mobile, opens the rear camera.
 * Renders as a plain avatar (no upload) when `editable` is false. */
export function EditableAvatar({
  src,
  name,
  folder,
  editable = true,
  onChange,
  onRemove,
  onError,
  className,
}: {
  src?: string | null
  name: string
  /** Zielordner im Bucket — MUSS die Kontakt-ID sein, sonst greift die
   *  Zugriffsregel aus Migration 0020 nicht. */
  folder: string
  editable?: boolean
  /** Erhält die zu speichernde Referenz (Storage-Pfad oder Data-URL). */
  onChange: (ref: string) => void | Promise<void>
  /**
   * Entfernt das vorhandene Foto ersatzlos. Ohne diese Funktion gibt es keinen
   * Entfernen-Knopf — Aufrufer ohne Löschrecht lassen sie einfach weg.
   */
  onRemove?: () => void | Promise<void>
  onError?: (message: string) => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  if (!editable) {
    return (
      <div className={cn('relative shrink-0', className)}>
        <Avatar src={src} name={name} className="size-16 text-lg" />
      </div>
    )
  }

  const handle = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const blob = await fileToResizedBlob(file)
      // Awaiten: der Aufrufer speichert und räumt das alte Bild weg. Ohne das
      // Warten wäre der Knopf schon wieder aktiv, während beides noch läuft.
      await onChange(await fileStore.upload('contact-avatars', folder, blob))
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Foto konnte nicht gespeichert werden')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (!onRemove) return
    setBusy(true)
    try {
      await onRemove()
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Foto konnte nicht entfernt werden')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('relative shrink-0', className)}>
      <Avatar src={src} name={name} className="size-16 text-lg" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Foto aufnehmen oder hochladen"
        // z-10: sits above an optional photo-zoom overlay placed on the avatar
        // by callers (IdentityCard), so the camera stays clickable.
        className="absolute -bottom-1 -right-1 z-10 flex size-7 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        <Camera className="size-3.5" />
      </button>
      {src && onRemove && (
        <button
          type="button"
          onClick={() => void handleRemove()}
          disabled={busy}
          aria-label={`Foto von ${name} entfernen`}
          title="Foto entfernen"
          // Dauerhaft sichtbar, nicht erst beim Überfahren: auf Tablet und Handy
          // gibt es kein Hover, dort wäre der Knopf sonst unauffindbar.
          className="absolute -right-1 -top-1 z-10 flex size-7 items-center justify-center rounded-full border-2 border-background bg-card text-destructive shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-60"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handle}
        className="hidden"
      />
    </div>
  )
}
