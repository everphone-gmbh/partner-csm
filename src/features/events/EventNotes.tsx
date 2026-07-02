import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Mic, Send, Square, X } from 'lucide-react'
import type { EventNote, NoteAttachment } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { fileToResizedDataUrl } from '@/lib/image'
import { formatDateTime } from '@/lib/format'

/** Records a voice memo via MediaRecorder and returns it as a data URL. */
function VoiceRecorder({ onRecorded }: { onRecorded: (url: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        const reader = new FileReader()
        reader.onload = () => onRecorded(reader.result as string)
        reader.readAsDataURL(blob)
        stream.getTracks().forEach((t) => t.stop())
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
      setError(false)
    } catch {
      setError(true)
    }
  }
  const stop = () => {
    recRef.current?.stop()
    setRecording(false)
  }

  if (error) return <span className="text-xs text-muted-foreground">Kein Mikrofon</span>
  return recording ? (
    <Button type="button" variant="destructive" size="sm" onClick={stop}>
      <Square className="size-4" /> Stop
    </Button>
  ) : (
    <Button type="button" variant="outline" size="sm" onClick={start}>
      <Mic className="size-4" /> Sprachmemo
    </Button>
  )
}

function AttachmentView({ attachment, size }: { attachment: NoteAttachment; size: string }) {
  if (attachment.kind === 'image') {
    return (
      <img
        src={attachment.url}
        alt={attachment.name ?? ''}
        className={`${size} rounded-md border border-border object-cover`}
      />
    )
  }
  return <audio src={attachment.url} controls className="h-8" />
}

export function EventNotes({ eventId }: { eventId: string }) {
  const { user } = useSession()
  const [notes, setNotes] = useState<EventNote[]>([])
  const [text, setText] = useState('')
  const [pending, setPending] = useState<NoteAttachment[]>([])
  const [saving, setSaving] = useState(false)
  const imgRef = useRef<HTMLInputElement>(null)

  const refresh = () => {
    void repository.listEventNotes(eventId).then(setNotes)
  }
  useEffect(refresh, [eventId])

  const addImages = async (files: FileList) => {
    const added: NoteAttachment[] = []
    for (const f of Array.from(files)) {
      const url = await fileToResizedDataUrl(f, 1024)
      added.push({ id: crypto.randomUUID(), kind: 'image', url, name: f.name })
    }
    setPending((p) => [...p, ...added])
    if (imgRef.current) imgRef.current.value = ''
  }
  const addAudio = (url: string) =>
    setPending((p) => [...p, { id: crypto.randomUUID(), kind: 'audio', url, name: 'Sprachmemo' }])
  const removePending = (id: string) => setPending((p) => p.filter((a) => a.id !== id))

  const save = async () => {
    if (!text.trim() && pending.length === 0) return
    setSaving(true)
    try {
      await repository.addEventNote({
        eventId,
        text: text.trim(),
        authorName: user.name,
        attachments: pending,
      })
      setText('')
      setPending([])
      refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Schnellnotiz</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Was passiert gerade? Schnell festhalten…"
        />
        {pending.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {pending.map((a) => (
              <div key={a.id} className="relative">
                <AttachmentView attachment={a} size="size-16" />
                <button
                  type="button"
                  onClick={() => removePending(a.id)}
                  aria-label="Anhang entfernen"
                  className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 shadow"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => imgRef.current?.click()}>
            <ImagePlus className="size-4" /> Bild
          </Button>
          <VoiceRecorder onRecorded={addAudio} />
          <input
            ref={imgRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void addImages(e.target.files)
            }}
          />
          <div className="ml-auto">
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={saving || (!text.trim() && pending.length === 0)}
            >
              <Send className="size-4" /> {saving ? 'Speichern…' : 'Speichern'}
            </Button>
          </div>
        </div>

        {notes.length > 0 && (
          <ul className="space-y-3 border-t border-border pt-3">
            {notes.map((n) => (
              <li key={n.id} className="space-y-1.5">
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(n.createdAt)} · {n.authorName}
                </div>
                {n.text && <p className="whitespace-pre-wrap text-sm text-foreground">{n.text}</p>}
                {n.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {n.attachments.map((a) => (
                      <AttachmentView key={a.id} attachment={a} size="size-20" />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
