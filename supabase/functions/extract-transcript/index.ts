/**
 * Transkript-Extraktion, serverseitig — der Auto-Weg der Karte „Aus Transkript
 * importieren" (Deno Edge Function, deployt über GitHub-Push, siehe CLAUDE.md).
 *
 * Ablauf: ein angemeldeter RM+ schickt { transcript, contactName } → der Name
 * der Kontaktperson wird VOR dem KI-Aufruf redigiert (Datenminimierung: der
 * Klarname erreicht den Modellanbieter nicht) → Gemini `generateContent`
 * (Endpoint TRANSCRIPT_AI_URL, Schlüssel TRANSCRIPT_AI_KEY, beide als Secret,
 * nie im Client) → der rohe JSON-Text geht zurück. Geparst, dedupliziert und
 * Art.-9-geprüft wird im Client (extraction.ts) — dort bestätigt der Nutzer
 * jeden Fakt einzeln. Das Transkript wird nirgends gespeichert.
 *
 * Ohne gesetzte Secrets antwortet die Function mit { error: "not_configured" }
 * — die Karte fällt dann auf den manuellen Gemini-Workspace-Weg zurück. So
 * kann der Code deployt sein, BEVOR ein DSGVO-tauglicher (Vertex-)Schlüssel
 * existiert; scharf geschaltet wird allein über set_edge_function_secret.
 *
 * Erwartete Fehlerfälle kommen bewusst als HTTP 200 mit { error: … } zurück:
 * supabase-js functions.invoke liefert bei Nicht-2xx den Antwort-Body nicht
 * mit aus, 4xx bleibt deshalb den Auth-Fällen vorbehalten.
 *
 * ⚠ Der REGELN-Block unten muss wortgleich zu EXTRACTION_RULES in
 * src/features/contacts/transcript/extraction.ts bleiben —
 * promptParity.test.ts erzwingt das.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RULES = `REGELN:
- Extrahiere NUR Fakten, die wörtlich im Transkript stehen. Rate nichts, ergänze nichts.
- Antworte AUSSCHLIESSLICH mit einem JSON-Array. Kein weiterer Text, keine Markdown-Codeblöcke.
- Jedes Element hat die Form:
  { "target": <Feld>, "value": <Wert>, "evidence": <wörtliches Zitat>, "category": <nur bei sideFact>, "withUs": <nur bei customer> }
- Erlaubte "target"-Werte:
  - "birthday"     – Geburtsdatum im Format YYYY-MM-DD (nur wenn eindeutig ableitbar)
  - "location"     – Wohnort
  - "familyStatus" – Familienstand
  - "children"     – Kinder (Anzahl/Alter)
  - "pets"         – Haustiere
  - "sideFact"     – privater Anknüpfungspunkt; "category" ist eines von: hobby, sport, family, interest, other
  - "customer"     – erwähnte Firma/Kunde; "withUs" ist true, wenn eine bestehende Zusammenarbeit genannt wird, sonst false
- "evidence" ist ein wörtliches, kurzes Zitat aus dem Transkript, das den Fakt belegt.
- NIEMALS extrahieren (DSGVO Art. 9): Gesundheit, Religion/Weltanschauung, politische Meinung, Gewerkschaftszugehörigkeit, Sexualleben, ethnische Herkunft.
- Gibt es nichts Belegbares, antworte mit: []`

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Datenminimierung: der volle Name UND die einzelnen Namensbestandteile werden
 * durch „die Kontaktperson" ersetzt, bevor das Transkript das Haus verlässt.
 * Kurze Bestandteile (≤ 2 Zeichen, z. B. „v.") bleiben stehen, sonst zerschösse
 * die Ersetzung normale Wörter.
 */
function redactName(transcript: string, fullName: string): string {
  const parts = new Set(
    [fullName.trim(), ...fullName.split(/\s+/)].filter((p) => p.length > 2),
  )
  let out = transcript
  for (const p of parts) {
    out = out.replace(new RegExp(escapeRegExp(p), 'gi'), 'die Kontaktperson')
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Nur angemeldete, privilegierte Nutzer (RM+): der KI-Schlüssel kostet Geld,
  // und nur RM+ sehen die Karte — dieselbe Grenze wie in der Oberfläche.
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
  const aiKey = Deno.env.get('TRANSCRIPT_AI_KEY')
  if (!aiUrl || !aiKey) return json({ error: 'not_configured' })

  let body: { transcript?: string; contactName?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Ungültiger Request-Body.' }, 400)
  }
  const transcript = (body.transcript ?? '').trim()
  const contactName = (body.contactName ?? '').trim()
  if (!transcript || !contactName) {
    return json({ error: 'transcript und contactName sind Pflichtfelder.' }, 400)
  }
  if (transcript.length > 200_000) {
    return json({ error: 'Transkript ist zu lang (max. 200.000 Zeichen).' })
  }

  const redacted = redactName(transcript, contactName)
  const prompt = `Du extrahierst strukturierte Fakten über die Kontaktperson aus dem folgenden Gesprächstranskript für ein Vertriebs-Beziehungs-CRM. Der Name der Kontaktperson wurde vorab durch „die Kontaktperson" ersetzt.

${RULES}

TRANSKRIPT:
"""
${redacted}
"""`

  let aiResp: Response
  try {
    aiResp = await fetch(aiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': aiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // Deterministisch: gleiches Transkript → gleiche Vorschläge.
        generationConfig: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(45_000),
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
  const raw = parts.map((p) => p.text ?? '').join('')
  if (!raw.trim()) return json({ error: 'Leere Antwort vom Modell.' })
  return json({ raw })
})
