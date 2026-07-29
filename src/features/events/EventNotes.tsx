import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Mic, Send, Square, X } from 'lucide-react'
import type { EventNote, NoteAttachment } from '@/domain/types'
import { repository } from '@/data/repositoryProvider'
import { useSession } from '@/app/SessionContext'
import { saveErrorMessage, useToast } from '@/components/ui/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { fileToResizedBlob } from '@/lib/image'
import { fileStore } from '@/lib/fileStore'
import { useFileUrl } from '@/lib/useFileUrl'
import { formatDateTime } from '@/lib/format'

/** Records a voice memo via MediaRecorder and returns it as a data URL. */
function VoiceRecorder({ onRecorded }: { onRecorded: (audio: Blob) => void }) {
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
        // Blob weitergeben, nicht base64: der Upload braucht die Rohdaten.
        onRecorded(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }))
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
  const resolved = useFileUrl(attachment.url)
  if (!resolved) {
    return attachment.kind === 'image' ? (
      <div className={`${size} animate-pulse rounded-md bg-secondary`} aria-hidden="true" />
    ) : (
      <span className="text-xs text-muted-foreground">Sprachmemo wird geladen…</span>
    )
  }
  if (attachment.kind === 'image') {
    return (
      <img
        src={resolved}
        alt={attachment.name ?? ''}
        className={`${size} rounded-md border border-border object-cover`}
      />
    )
  }
  return <audio src={resolved} controls className="h-8" />
}

export function EventNotes({
  eventId,
  eventName,
  attendeeContacts = [],
}: {
  eventId: string
  eventName?: string
  /** Attendees offered for the optional note→person assignment. */
  attendeeContacts?: { id: string; fullName: string }[]
}) {
  const { user } = useSession()
  const { toast } = useToast()
  const [noteContactId, setNoteContactId] = useState('')
  const [toTimeline, setToTimeline] = useState(false)
  const [notes, setNotes] = useState<EventNote[]>([])
  const [text, setText] = useState('')
  const [pending, setPending] = useState<NoteAttachment[]>([])
  const [saving, setSaving] = useState(false)
  const imgRef = useRef<HTMLInputElement>(null)

  const refresh = () => {
    void repository
      .listEventNotes(eventId)
      .then(setNotes)
      .catch((err: unknown) => toast(saveErrorMessage(err)))
  }
  useEffect(refresh, [eventId])

  const addImages = async (files: FileList) => {
    try {
      const added: NoteAttachment[] = []
      for (const f of Array.from(files)) {
        const blob = await fileToResizedBlob(f, 1024)
        const url = await fileStore.upload('event-note-media', eventId, blob)
        added.push({ id: crypto.randomUUID(), kind: 'image', url, name: f.name })
      }
      setPending((p) => [...p, ...added])
    } catch (err) {
      toast(saveErrorMessage(err))
    } finally {
      if (imgRef.current) imgRef.current.value = ''
    }
  }
  const addAudio = async (blob: Blob) => {
    try {
      const url = await fileStore.upload('event-note-media', eventId, blob)
      setPending((p) => [...p, { id: crypto.randomUUID(), kind: 'audio', url, name: 'Sprachmemo' }])
    } catch (err) {
      toast(saveErrorMessage(err))
    }
  }
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
        contactId: noteContactId || undefined,
      })
      // Optional: the note also lands in the contact's activity timeline,
      // so the event feeds the relationship history directly.
      if (noteContactId && toTimeline && text.trim()) {
        await repository.addActivity({
          contactId: noteContactId,
          type: 'meeting',
          occurredAt: new Date().toISOString(),
          authorId: user.id,
          authorName: user.name,
          body: eventName ? `[${eventName}] ${text.trim()}` : text.trim(),
        })
      }
      setText('')
      setPending([])
      setNoteContactId('')
      setToTimeline(false)
      refresh()
    } catch (err) {
      toast(saveErrorMessage(err)) // text + attachments stay in the form
    } finally {
      setSaving(false)
    }
  }

  const contactName = (cid: string) =>
    attendeeContacts.find((c) => c.id === cid)?.fullName ?? 'Kontakt'

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
        {attendeeContacts.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              className="h-9 rounded-[10px] border border-transparent bg-secondary px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-56"
              value={noteContactId}
              onChange={(e) => {
                setNoteContactId(e.target.value)
                if (!e.target.value) setToTimeline(false)
              }}
            >
              <option value="">Ohne Personenbezug</option>
              {attendeeContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </select>
            {noteContactId && (
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={toTimeline}
                  onChange={(e) => setToTimeline(e.target.checked)}
                  className="size-4 accent-primary"
                />
                auch in die Timeline von {contactName(noteContactId).split(' ')[0]} übernehmen
              </label>
            )}
          </div>
        )}
        {pending.length > 0 && (
          <div className="space-y-2">
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
            {/* Voice memos: quick manual transcript so the content is
                searchable/briefable. Auto-transcription follows with the EU
                AI endpoint. */}
            {pending
              .filter((a) => a.kind === 'audio')
              .map((a) => (
                <Input
                  key={`tr-${a.id}`}
                  value={a.transcript ?? ''}
                  onChange={(e) =>
                    setPending((p) =>
                      p.map((x) => (x.id === a.id ? { ...x, transcript: e.target.value } : x)),
                    )
                  }
                  placeholder="Transkript zum Sprachmemo (optional) …"
                  className="text-sm"
                />
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
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {formatDateTime(n.createdAt)} · {n.authorName}
                  {n.contactId && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                      {contactName(n.contactId)}
                    </span>
                  )}
                </div>
                {n.text && <p className="whitespace-pre-wrap text-sm text-foreground">{n.text}</p>}
                {n.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {n.attachments.map((a) => (
                      <AttachmentView key={a.id} attachment={a} size="size-20" />
                    ))}
                  </div>
                )}
                {n.attachments
                  .filter((a) => a.transcript)
                  .map((a) => (
                    <p key={`tr-${a.id}`} className="text-sm italic text-muted-foreground">
                      🎙 „{a.transcript}“
                    </p>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
