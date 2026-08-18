import { useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Nimmt eine Sprachnotiz über MediaRecorder auf und liefert sie als Blob.
 * Der Browser bestimmt das Container-Format (Chrome: audio/webm+opus,
 * Safari: audio/mp4/AAC) — beide sind gegen Vertex-Gemini verifiziert
 * (2026-08-17), Abnehmer müssen also nicht transkodieren.
 *
 * Ursprünglich inline in EventNotes; herausgezogen, als der Transkript-Import
 * (Sprachnotiz nach dem Gespräch) denselben Recorder brauchte.
 */
export function VoiceRecorder({
  onRecorded,
  label = 'Sprachmemo',
}: {
  onRecorded: (audio: Blob) => void
  label?: string
}) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // 32 kbps reicht für Diktat-Qualität. Der Browser-Default (Chrome:
      // ~128 kbps) machte lange Notizen so groß, dass der Function-Worker
      // beim Transkribieren am Speicherlimit starb („Failed to fetch").
      const rec = new MediaRecorder(stream, { audioBitsPerSecond: 32_000 })
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        // Blob weitergeben, nicht base64: der Abnehmer braucht die Rohdaten.
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
      <Mic className="size-4" /> {label}
    </Button>
  )
}
