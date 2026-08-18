/**
 * Sprachnotiz → Text, serverseitig (Deno Edge Function, deployt über
 * GitHub-Push, siehe CLAUDE.md).
 *
 * Zweck: RM+ spricht NACH einem Gespräch eine Notiz ein (bewusst KEIN
 * Anruf-Mitschnitt — der wäre ohne Einwilligung beider Seiten strafbar);
 * die Karte „Aus Transkript importieren" schickt das Audio hierher, bekommt
 * den Text zurück und läuft dann durch die normale Extraktion
 * (extract-transcript) mit Review/Approve. Das Audio wird nur durchgereicht
 * und nirgends gespeichert.
 *
 * Nutzt dieselben Secrets wie extract-transcript (TRANSCRIPT_AI_URL /
 * TRANSCRIPT_AI_SA bzw. TRANSCRIPT_AI_KEY) — gemini-2.5-flash versteht Audio
 * direkt; verifiziert für audio/webm (Chrome) und audio/mp4 (Safari) am
 * 2026-08-17 gegen europe-west3.
 *
 * ⚠ Auth-Block und buildAuthHeader sind bewusst eine Kopie aus
 * extract-transcript/index.ts (Functions sind self-contained, ein _shared-
 * Import über Ordnergrenzen ist mit dem Plattform-Router nicht verifiziert).
 * Änderungen dort hier nachziehen.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Container-Formate der gängigen Browser-Recorder; Gemini nimmt beide. */
const ALLOWED_AUDIO = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/aac',
  'audio/x-m4a',
  'audio/flac',
])

const TRANSCRIBE_PROMPT =
  'Transkribiere die folgende deutsche Sprachnotiz wörtlich. Gib NUR den ' +
  'transkribierten Text zurück — ohne Einleitung, ohne Anführungszeichen, ' +
  'ohne Formatierung. Fülllaute (äh, mhm) lässt du aus; sonst nichts ' +
  'hinzufügen oder weglassen.'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function buildAuthHeader(): Promise<Record<string, string>> {
  const key = Deno.env.get('TRANSCRIPT_AI_KEY')
  if (key) return { 'x-goog-api-key': key }

  const meta = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=' +
      encodeURIComponent('https://www.googleapis.com/auth/cloud-platform'),
    { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(5_000) },
  )
  if (!meta.ok) throw new Error(`Metadata-Server antwortete ${meta.status}`)
  const baseToken = (await meta.json()).access_token as string

  const sa = Deno.env.get('TRANSCRIPT_AI_SA')
  if (!sa) return { Authorization: `Bearer ${baseToken}` }

  const imp = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(sa)}:generateAccessToken`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${baseToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: ['https://www.googleapis.com/auth/cloud-platform'],
        lifetime: '300s',
      }),
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!imp.ok) {
    throw new Error(`Impersonation von ${sa} fehlgeschlagen (${imp.status}): ${(await imp.text()).slice(0, 200)}`)
  }
  return { Authorization: `Bearer ${(await imp.json()).accessToken}` }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Nur angemeldete, privilegierte Nutzer (RM+) — wie bei extract-transcript.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey || !token) return json({ error: 'unauthorized' }, 401)
  const admin = createClient(supabaseUrl, serviceKey)
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData?.user) return json({ error: 'unauthorized' }, 401)
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()
  if (!profile || !['overall_admin', 'sub_admin'].includes(profile.role)) {
    return json({ error: 'forbidden' }, 403)
  }

  const aiUrl = Deno.env.get('TRANSCRIPT_AI_URL')
  if (!aiUrl) return json({ error: 'not_configured' })

  let body: { audio?: string; mimeType?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Ungültiger Request-Body.' }, 400)
  }
  const audio = (body.audio ?? '').trim()
  // Codec-Zusatz abschneiden: Chrome meldet z. B. "audio/webm;codecs=opus".
  const mimeType = (body.mimeType ?? '').split(';')[0].trim().toLowerCase()
  if (!audio) return json({ error: 'audio (base64) ist Pflicht.' }, 400)
  if (!ALLOWED_AUDIO.has(mimeType)) {
    return json({ error: `Nicht unterstütztes Audioformat: ${mimeType || '(leer)'}.` })
  }
  // ~20 MB Base64 ≈ 15 MB Audio — deckt sich mit dem Client-Limit und bleibt
  // unter dem 20-MB-Request-Limit von Vertex. Größere Payloads sterben ohnehin
  // schon am 150-MB-Speicherlimit des Workers, bevor dieser Check greift —
  // die eigentliche Begrenzung passiert deshalb clientseitig VOR dem Upload.
  if (audio.length > 20_000_000) {
    return json({ error: 'Aufnahme ist zu groß (max. ~15 MB).' })
  }

  let authHeader: Record<string, string>
  try {
    authHeader = await buildAuthHeader()
  } catch (err) {
    return json({ error: `KI-Auth fehlgeschlagen: ${String(err)}` })
  }

  let aiResp: Response
  try {
    aiResp = await fetch(aiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: TRANSCRIBE_PROMPT },
              { inlineData: { mimeType, data: audio } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(90_000),
    })
  } catch (err) {
    return json({ error: `KI-Endpoint nicht erreichbar: ${String(err)}` })
  }
  if (!aiResp.ok) {
    const detail = (await aiResp.text()).slice(0, 300)
    return json({ error: `KI-Endpoint antwortete ${aiResp.status}: ${detail}` })
  }
  const ai = await aiResp.json()
  const parts: { text?: string }[] = ai?.candidates?.[0]?.content?.parts ?? []
  const transcript = parts
    .map((p) => p.text ?? '')
    .join('')
    .trim()
  if (!transcript) return json({ error: 'Leere Antwort vom Modell.' })
  return json({ transcript })
})
