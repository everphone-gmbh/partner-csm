import { useState } from 'react'
import { Check, ClipboardCopy, ShieldAlert, Sparkles } from 'lucide-react'
import type { Contact } from '@/domain/types'
import type { ContactPatch } from '@/data/repository'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  buildExtractionPrompt,
  parseSuggestions,
  planApply,
  type ExtractionSuggestion,
  type ExtractionTarget,
} from './transcript/extraction'
import { autoExtractAvailable, extractViaServer, transcribeViaServer } from './transcript/autoExtract'
import { VoiceRecorder } from '@/components/VoiceRecorder'

const TARGET_LABEL: Record<ExtractionTarget, string> = {
  birthday: 'Geburtstag',
  location: 'Wohnort',
  familyStatus: 'Familienstand',
  children: 'Kinder',
  pets: 'Haustiere',
  sideFact: 'Anknüpfungspunkt',
  customer: 'Kunde',
}

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
  const [result, setResult] = useState<{ applied: number; skipped: string[] } | null>(null)

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

  const approvedCount = suggestions
    ? suggestions.filter((s) => approved.has(s.id) && !s.blocked).length
    : 0

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
          <div className="space-y-2 text-sm">
            <p className="font-medium text-status-green">{result.applied} Fakt(en) übernommen.</p>
            {result.skipped.length > 0 && (
              <div className="text-muted-foreground">
                <p>Übersprungen:</p>
                <ul className="list-disc pl-5">
                  {result.skipped.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            <Button size="sm" variant="outline" onClick={reset}>
              Weiteres Transkript
            </Button>
          </div>
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
                {/*
                  Transparenz statt stillem Weglassen: der RM soll wissen, WARUM
                  z. B. eine erwähnte Krankheit nicht auftaucht — sonst wirkt die
                  Extraktion lückenhaft. Der Ausschluss selbst passiert zweistufig
                  (Prompt-Verbot + Client-Filter, siehe extraction.ts).
                */}
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Besondere Kategorien nach Art. 9 DSGVO (Gesundheit, Religion, politische
                    Meinung, Gewerkschaft, Sexualleben, Herkunft) werden bewusst nicht
                    extrahiert und nie übernommen — auch wenn das Transkript sie erwähnt.
                  </span>
                </p>
                {suggestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine belegbaren Fakten gefunden.</p>
                ) : (
                  <ul className="space-y-2">
                    {suggestions.map((s) => (
                      <li key={s.id} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={approved.has(s.id) && !s.blocked}
                          disabled={s.blocked}
                          onChange={() => toggle(s.id)}
                          aria-label={`${s.value} übernehmen`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{TARGET_LABEL[s.target]}</Badge>
                            <span className="text-sm font-medium">{s.value}</span>
                            {s.target === 'customer' && (
                              <span className="text-xs text-muted-foreground">
                                {s.withUs ? 'mit uns' : 'Potenzial'}
                              </span>
                            )}
                          </div>
                          {s.evidence && (
                            <p className="text-xs italic text-muted-foreground">„{s.evidence}"</p>
                          )}
                          {s.blocked && (
                            <p className="flex items-center gap-1 text-xs text-destructive">
                              <ShieldAlert className="size-3.5" /> Art. 9 ({s.blockReason}) — nicht übernehmbar
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {suggestions.length > 0 && (
                  <Button size="sm" onClick={apply} disabled={applying || approvedCount === 0}>
                    {applying ? 'Übernehme…' : `Übernehmen (${approvedCount})`}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
