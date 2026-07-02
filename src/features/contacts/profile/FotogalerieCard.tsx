import { useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import type { Contact, GalleryPhoto } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fileToResizedDataUrl } from '@/lib/image'

export function FotogalerieCard({
  contact,
  canEdit,
  onSave,
}: {
  contact: Contact
  canEdit: boolean
  onSave: (patch: ContactPatch) => Promise<void>
}) {
  const gallery = contact.gallery ?? []
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const addFiles = async (files: FileList) => {
    setBusy(true)
    try {
      const added: GalleryPhoto[] = []
      for (const file of Array.from(files)) {
        const url = await fileToResizedDataUrl(file, 800)
        added.push({ id: crypto.randomUUID(), url })
      }
      await onSave({ gallery: [...gallery, ...added] })
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }
  const remove = (photoId: string) =>
    void onSave({ gallery: gallery.filter((p) => p.id !== photoId) })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Fotogalerie</CardTitle>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              <Camera className="size-3.5" /> {busy ? 'Lädt…' : 'Hinzufügen'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length) void addFiles(e.target.files)
              }}
            />
          </>
        )}
      </CardHeader>
      <CardContent>
        {gallery.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Fotos.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {gallery.map((p) => (
              <div
                key={p.id}
                className="group relative aspect-square overflow-hidden rounded-md border border-border"
              >
                <img src={p.url} alt={p.caption ?? ''} className="size-full object-cover" />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    aria-label="Foto entfernen"
                    className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 text-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
