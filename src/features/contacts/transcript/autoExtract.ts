/**
 * Serverseitige Auto-Extraktion über die Edge Function `extract-transcript` —
 * der KI-Schlüssel bleibt dort als Secret, der Client sieht ihn nie.
 *
 * Bewusst KEIN `supabase.functions.invoke`: in der Sovereign Cloud laufen die
 * Edge Functions auf einem eigenen Cloud-Run-Host (`VITE_FUNCTIONS_URL`, aus
 * `deploy_edge_function`), nicht unter `<supabase-url>/functions/v1` — invoke
 * liefe gegen das falsche Gateway (dort kommt 401 vom Kong). Die URL ist
 * öffentlich unkritisch; Login + RM+-Rolle erzwingt die Function selbst.
 *
 * Verfügbar nur im Supabase-Modus (der Mock hat keine Edge Functions). Solange
 * auf der Function kein KI-Schlüssel gesetzt ist, meldet sie `not_configured` —
 * die Karte fällt dann auf den manuellen Gemini-Workspace-Weg zurück. Dadurch
 * kann dieser Code live sein, bevor der DSGVO-taugliche (Vertex-)Schlüssel
 * existiert.
 */
import { activeBackend } from '@/data/repositoryProvider'

const env = import.meta.env as unknown as Record<string, string | undefined>
const FUNCTIONS_URL = env.VITE_FUNCTIONS_URL?.replace(/\/$/, '')

export interface AutoExtractResult {
  ok: boolean
  /** Roher Antworttext des Modells (JSON-Array) — liest parseSuggestions ein. */
  raw?: string
  error?: string
  /** true: kein KI-Schlüssel gesetzt bzw. keine Functions-URL → manueller Weg. */
  notConfigured?: boolean
}

export function autoExtractAvailable(): boolean {
  return activeBackend === 'supabase' && Boolean(FUNCTIONS_URL)
}

export interface TranscribeResult {
  ok: boolean
  transcript?: string
  error?: string
  /** true: kein KI-Schlüssel gesetzt bzw. keine Functions-URL → Funktion nicht nutzbar. */
  notConfigured?: boolean
}

/**
 * Sprachnotiz (Blob aus dem VoiceRecorder) → Text über die Edge Function
 * `transcribe-memo`. Das Audio wird nur durchgereicht, nie gespeichert.
 */
/**
 * Obergrenze fürs Audio: schützt den 150-MB-Function-Worker (Base64 liegt dort
 * mehrfach kopiert im Speicher) und bleibt unter dem 20-MB-Request-Limit von
 * Vertex. Mit 32 kbps (VoiceRecorder) entspricht das über einer Stunde Notiz.
 */
const MAX_AUDIO_BYTES = 15 * 1024 * 1024

export async function transcribeViaServer(audio: Blob): Promise<TranscribeResult> {
  if (audio.size > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      error: 'Aufnahme ist zu groß (über 15 MB) — bitte in mehreren kürzeren Notizen einsprechen.',
    }
  }
  if (!FUNCTIONS_URL) {
    return { ok: false, notConfigured: true, error: 'Keine Functions-URL konfiguriert.' }
  }
  const { supabase } = await import('@/lib/supabase')
  if (!supabase) return { ok: false, error: 'Kein Supabase-Client verfügbar.' }
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { ok: false, error: 'Keine aktive Sitzung — bitte neu anmelden.' }

  let resp: Response
  try {
    resp = await fetch(`${FUNCTIONS_URL}/transcribe-memo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        audio: await blobToBase64(audio),
        mimeType: audio.type || 'audio/webm',
      }),
    })
  } catch (err) {
    // Nacktes „Failed to fetch" heißt meist: der Worker ist an einer zu großen
    // Aufnahme gestorben (die 500-Antwort des Routers trägt keine CORS-Header,
    // der Browser zeigt dann nur den Netzwerkfehler).
    console.warn('[Sprachnotiz] Originaltext:', err)
    return {
      ok: false,
      error:
        'Die Sprachnotiz ließ sich nicht umwandeln. Bei langen Aufnahmen hilft es, mehrere kürzere Notizen einzusprechen.',
    }
  }
  if (!resp.ok) {
    console.warn('[Sprachnotiz] HTTP', resp.status)
    return { ok: false, error: 'Die Sprachnotiz ließ sich nicht umwandeln. Versuch es gleich noch einmal.' }
  }

  const d = (await resp.json()) as { transcript?: string; error?: string } | null
  if (d?.error === 'not_configured') {
    return { ok: false, notConfigured: true, error: 'Die KI-Auswertung ist noch nicht eingerichtet.' }
  }
  if (d?.error) {
    // Die Meldung der Function ist Technik (englisch) — nur für die Fehlersuche.
    console.warn('[Sprachnotiz] Originaltext:', d.error)
    return { ok: false, error: 'Die Sprachnotiz ließ sich nicht umwandeln. Versuch es gleich noch einmal.' }
  }
  if (!d?.transcript) return { ok: false, error: 'Die Sprachnotiz kam leer zurück. Sprich sie noch einmal ein.' }
  return { ok: true, transcript: d.transcript }
}

/**
 * Blob → reiner Base64-String (ohne data:-Präfix). FileReader statt btoa,
 * weil btoa/String.fromCharCode bei minutenlangen Aufnahmen am Argument-
 * Limit scheitert.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error ?? new Error('Audio konnte nicht gelesen werden.'))
    reader.readAsDataURL(blob)
  })
}

export async function extractViaServer(
  transcript: string,
  contactName: string,
): Promise<AutoExtractResult> {
  if (!FUNCTIONS_URL) {
    return { ok: false, notConfigured: true, error: 'Keine Functions-URL konfiguriert.' }
  }
  const { supabase } = await import('@/lib/supabase')
  if (!supabase) return { ok: false, error: 'Kein Supabase-Client verfügbar.' }
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { ok: false, error: 'Keine aktive Sitzung — bitte neu anmelden.' }

  let resp: Response
  try {
    resp = await fetch(`${FUNCTIONS_URL}/extract-transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ transcript, contactName }),
    })
  } catch (err) {
    console.warn('[KI-Auswertung] Originaltext:', err)
    return { ok: false, error: 'Die KI-Auswertung war nicht erreichbar. Prüf die Verbindung und versuch es noch einmal.' }
  }
  if (!resp.ok) {
    console.warn('[KI-Auswertung] HTTP', resp.status)
    return { ok: false, error: 'Die KI-Auswertung hat nicht geklappt. Versuch es gleich noch einmal.' }
  }

  const d = (await resp.json()) as { raw?: string; error?: string } | null
  if (d?.error === 'not_configured') {
    return { ok: false, notConfigured: true, error: 'Die KI-Auswertung ist noch nicht eingerichtet.' }
  }
  if (d?.error) {
    console.warn('[KI-Auswertung] Originaltext:', d.error)
    return { ok: false, error: 'Die KI-Auswertung hat nicht geklappt. Versuch es gleich noch einmal.' }
  }
  if (!d?.raw) return { ok: false, error: 'Die KI-Auswertung kam leer zurück. Versuch es noch einmal.' }
  return { ok: true, raw: d.raw }
}
