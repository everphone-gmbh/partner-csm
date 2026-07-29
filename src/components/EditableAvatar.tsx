import { useRef, useState, type ChangeEvent } from 'react'
import { Camera } from 'lucide-react'
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
  onChange: (ref: string) => void
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
      onChange(await fileStore.upload('contact-avatars', folder, blob))
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Foto konnte nicht gespeichert werden')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
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
        className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        <Camera className="size-3.5" />
      </button>
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
