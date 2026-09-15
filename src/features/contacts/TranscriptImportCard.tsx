import { useState } from 'react'
import { Check, ClipboardCopy, Sparkles } from 'lucide-react'
import type { Contact } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  buildExtractionPrompt,
  parseSuggestions,
  planApply,
  type ExtractionSuggestion,
} from './transcript/extraction'
import { autoExtractAvailable, extractViaServer, transcribeViaServer } from './transcript/autoExtract'
import { SuggestionReview, type ApplyResult } from './transcript/SuggestionReview'
import { VoiceRecorder } from '@/components/VoiceRecorder'

const areaCls =
  'w-full rounded-[10px] border border-transparent bg-secondary px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Wertet ein Gesprächstranskript (z. B. aus Jamie) aus. Zwei Wege:
 *
 * - **Auto** (Supabase-Modus): die Edge Function `extract-transcript` ruft das
 *   Modell serverseitig auf (Schlüssel bleibt Secret, Name wird vorab
 *   redigiert). Meldet sie `not_configured`, wechselt die Karte selbst auf …
 * - **Manuell**: der Nutzer führt den erzeugten Prompt in Gemini (Workspace)
 *   aus und fügt die JSON-Antwort zurück ein.
 *
 * Statt Einfügen geht im Auto-Modus auch eine **Sprachnotiz nach dem Gespräch**
 * (VoiceRecorder → transcribe-memo → Text ins Feld) — bewusst kein
 * Anruf-Mitschnitt, und das Audio wird nie gespeichert.
 *
 * In beiden Fällen wird nur übernommen, was der Nutzer einzeln bestätigt; das
 * Transkript wird nie gespeichert. Sichtbar nur für RM+ (canEdit-Gate in
 * ContactProfile).
 */
export function TranscriptImportCard({
  contact,
  onApply,
}: {
  contact: Contact
  onApply: (patch: ContactPatch) => Promise<void>
}) {
  const [transcript, setTranscript] = useState('')
  const [mode, setMode] = useState<'auto' | 'manual'>(autoExtractAvailable() ? 'auto' : 'manual')
  const [autoBusy, setAutoBusy] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [autoError, setAutoError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [response, setResponse] = useState('')
  const [suggestions, setSuggestions] = useState<ExtractionSuggestion[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [approved, setApproved] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<ApplyResult | null>(null)

  const showSuggestions = (items: ExtractionSuggestion[]) => {
    setParseError(null)
    setSuggestions(items)
    setApproved(new Set(items.filter((s) => !s.blocked).map((s) => s.id)))
    setResult(null)
  }

  const autoRun = async () => {
    setAutoBusy(true)
    setAutoError(null)
    try {
      const r = await extractViaServer(transcript.trim(), contact.fullName)
      if (!r.ok) {
        if (r.notConfigured) {
          // Kein KI-Schlüssel auf der Function → dauerhaft auf manuell umschalten.
          setMode('manual')
          setAutoError(
            'Der KI-Endpoint ist noch nicht freigeschaltet — unten der manuelle Weg über Gemini (Workspace).',
          )
        } else {
          setAutoError(r.error ?? 'KI-Aufruf fehlgeschlagen.')
        }
        return
      }
      const parsed = parseSuggestions(r.raw ?? '')
      if (!parsed.ok) {
        setAutoError(parsed.error ?? 'Die Antwort konnte nicht gelesen werden.')
        return
      }
      showSuggestions(parsed.suggestions)
    } finally {
      setAutoBusy(false)
    }
  }

  // Sprachnotiz NACH dem Gespräch (kein Mitschnitt): Audio → transcribe-memo →
  // Text landet im Transkript-Feld, wo der Nutzer ihn prüfen/korrigieren kann,
  // bevor die normale Extraktion läuft. Das Audio wird nicht gespeichert.
  const transcribeMemo = async (audio: Blob) => {
    setTranscribing(true)
    setAutoError(null)
    try {
      const r = await transcribeViaServer(audio)
      if (!r.ok) {
        if (r.notConfigured) {
          setMode('manual')
          setAutoError(
            'Der KI-Endpoint ist noch nicht freigeschaltet — Sprachnotizen brauchen ihn; unten der manuelle Weg über Gemini (Workspace).',
          )
        } else {
          setAutoError(r.error ?? 'Transkription fehlgeschlagen.')
        }
        return
      }
      setTranscript((prev) => (prev.trim() ? `${prev}\n${r.transcript}` : (r.transcript ?? '')))
    } finally {
      setTranscribing(false)
    }
  }

  const makePrompt = () => {
    setPrompt(buildExtractionPrompt(transcript.trim(), contact.fullName))
    setCopied(false)
  }
  const copyPrompt = async () => {
    if (!prompt) return
    try {
      await navigator.clipboard?.writeText(prompt)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  const check = () => {
    const r = parseSuggestions(response)
    if (!r.ok) {
      setParseError(r.error ?? 'Die Antwort konnte nicht gelesen werden.')
      setSuggestions(null)
      return
    }
    showSuggestions(r.suggestions)
  }
  const toggle = (id: string) =>
    setApproved((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const apply = async () => {
    if (!suggestions) return
    const chosen = suggestions.filter((s) => approved.has(s.id) && !s.blocked)
    const plan = planApply(contact, chosen)
    setApplying(true)
    try {
      if (Object.keys(plan.patch).length > 0) await onApply(plan.patch)
      setResult({ applied: plan.applied, skipped: plan.skipped })
      setSuggestions(null)
    } catch {
      // onApply (ContactProfile.save) zeigt bereits einen Toast — Karte offen lassen.
    } finally {
      setApplying(false)
    }
  }
  const reset = () => {
    // mode bleibt bewusst stehen: wer wegen not_configured auf manuell
    // gewechselt ist, soll nicht bei jedem Transkript neu dagegen laufen.
    setTranscript('')
    setAutoError(null)
    setPrompt(null)
    setResponse('')
    setSuggestions(null)
    setParseError(null)
    setResult(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" /> Aus Transkript importieren
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Gesprächstranskript (z. B. aus Jamie) einfügen — oder nach dem Gespräch eine
          Sprachnotiz einsprechen (kein Mitschnitt). Transkript und Audio werden nicht
          gespeichert, nur die von dir bestätigten Fakten.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {result ? (
          <SuggestionReview
            suggestions={[]}
            approved={approved}
            onToggle={toggle}
            onApply={apply}
            applying={applying}
            result={result}
          >
            <Button size="sm" variant="outline" onClick={reset}>
              Weiteres Transkript
            </Button>
          </SuggestionReview>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">1. Transkript einfügen</label>
              <textarea
                className={areaCls}
                rows={4}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Transkript aus Jamie hier einfügen…"
              />
              {mode === 'auto' ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" onClick={autoRun} disabled={!transcript.trim() || autoBusy}>
                    <Sparkles className="size-4" />
                    {autoBusy ? 'Extrahiere…' : 'Vorschläge erzeugen'}
                  </Button>
                  {/* Alternative zum Einfügen: Notiz nach dem Gespräch einsprechen. */}
                  <VoiceRecorder
                    label="Sprachnotiz einsprechen"
                    onRecorded={(audio) => void transcribeMemo(audio)}
                  />
                  {transcribing && (
                    <span className="text-xs text-muted-foreground">
                      Transkribiere… (bei langen Notizen kann das einige Minuten dauern)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setMode('manual')}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Manuell mit Gemini (Workspace)
                  </button>
                </div>
              ) : (
                <Button size="sm" onClick={makePrompt} disabled={!transcript.trim()}>
                  Prompt für Gemini erzeugen
                </Button>
              )}
              {autoError && <p className="text-sm text-destructive">{autoError}</p>}
            </div>

            {prompt && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  2. Diesen Prompt in Gemini (Workspace) ausführen
                </label>
                <textarea className={areaCls} rows={5} readOnly value={prompt} />
                <Button size="sm" variant="outline" onClick={copyPrompt}>
                  {copied ? (
                    <>
                      <Check className="size-4" /> Kopiert
                    </>
                  ) : (
                    <>
                      <ClipboardCopy className="size-4" /> Prompt kopieren
                    </>
                  )}
                </Button>
              </div>
            )}

            {prompt && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  3. Antwort von Gemini einfügen
                </label>
                <textarea
                  className={areaCls}
                  rows={4}
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder='[ { "target": "sideFact", … } ]'
                />
                <Button size="sm" onClick={check} disabled={!response.trim()}>
                  Vorschläge prüfen
                </Button>
                {parseError && <p className="text-sm text-destructive">{parseError}</p>}
              </div>
            )}

            {suggestions && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  4. Vorschläge prüfen und übernehmen
                </p>
                {/* Prüfliste geteilt mit dem Sprachmemo im Aktivitäts-Composer. */}
                <SuggestionReview
                  suggestions={suggestions}
                  approved={approved}
                  onToggle={toggle}
                  onApply={apply}
                  applying={applying}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
