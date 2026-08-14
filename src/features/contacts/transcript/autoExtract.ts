/**
 * Serverseitige Auto-Extraktion über die Edge Function `extract-transcript` —
 * der KI-Schlüssel bleibt dort als Secret, der Client sieht ihn nie.
 *
 * Verfügbar nur im Supabase-Modus (der Mock hat keine Edge Functions). Solange
 * auf der Function kein Schlüssel gesetzt ist, meldet sie `not_configured` —
 * die Karte fällt dann auf den manuellen Gemini-Workspace-Weg zurück. Dadurch
 * kann dieser Code live sein, bevor der DSGVO-taugliche (Vertex-)Schlüssel
 * existiert.
 */
import { activeBackend } from '@/data/repositoryProvider'

export interface AutoExtractResult {
  ok: boolean
  /** Roher Antworttext des Modells (JSON-Array) — liest parseSuggestions ein. */
  raw?: string
  error?: string
  /** true: Function erreichbar, aber kein KI-Schlüssel gesetzt → manueller Weg. */
  notConfigured?: boolean
}

export function autoExtractAvailable(): boolean {
  return activeBackend === 'supabase'
}

export async function extractViaServer(
  transcript: string,
  contactName: string,
): Promise<AutoExtractResult> {
  const { supabase } = await import('@/lib/supabase')
  if (!supabase) return { ok: false, error: 'Kein Supabase-Client verfügbar.' }
  const { data, error } = await supabase.functions.invoke('extract-transcript', {
    body: { transcript, contactName },
  })
  if (error) return { ok: false, error: `KI-Aufruf fehlgeschlagen: ${error.message}` }
  const d = data as { raw?: string; error?: string } | null
  if (d?.error === 'not_configured') {
    return { ok: false, notConfigured: true, error: 'KI-Endpoint ist noch nicht freigeschaltet.' }
  }
  if (d?.error) return { ok: false, error: d.error }
  if (!d?.raw) return { ok: false, error: 'Leere Antwort vom KI-Endpoint.' }
  return { ok: true, raw: d.raw }
}
