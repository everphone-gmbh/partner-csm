/**
 * Rohe Datenbankmeldungen gehören nicht auf den Bildschirm. Eine Kollegin sah am
 * 2026-09-24 `duplicate key value violates unique constraint "regions_name_key"`
 * und hielt das Tool für kaputt — dabei hatte sie nur einen Namen getippt, den es
 * schon gab. Diese Liste übersetzt die Fälle, die PostgREST durchreicht; der
 * Originaltext bleibt für die Fehlersuche auf der Konsole.
 *
 * Reihenfolge ist bedeutsam: der erste Treffer gewinnt, spezifisch vor allgemein.
 */
const DB_MESSAGE_PATTERNS: { match: RegExp; text: string }[] = [
  { match: /duplicate key value|unique constraint/i, text: 'Diesen Eintrag gibt es schon.' },
  {
    match: /violates foreign key constraint/i,
    text: 'Daran hängen noch andere Daten — deshalb geht das so nicht.',
  },
  {
    match: /row-level security|permission denied|insufficient privilege|\b42501\b/i,
    text: 'Dafür fehlt dir die Berechtigung.',
  },
  { match: /violates not-null constraint/i, text: 'Ein Pflichtfeld ist leer geblieben.' },
  { match: /value too long/i, text: 'Der Text ist zu lang.' },
  { match: /invalid input syntax|\b22\d{3}\b/i, text: 'Eine Eingabe hat das falsche Format.' },
  {
    match: /failed to fetch|networkerror|network request failed|timeout|ETIMEDOUT/i,
    text: 'Keine Verbindung zum Server. Versuch es gleich noch einmal.',
  },
]

/**
 * Erkennbar technische Meldung (englisch, Programmiersprache) — die zeigen wir
 * nicht, auch wenn sie keinem Muster oben entspricht. Eigene Meldungen der App
 * und der Datenbankfunktionen sind deutsch und gehen unverändert durch.
 */
const TECHNICAL =
  /\b(the|of|for|with|is|are|was|not|error|failed|failure|violates|column|relation|function|permission|denied|invalid|syntax|null|undefined|constraint|jwt|token|fetch|network|timeout|cannot|unexpected|schema|request|status|code|unable|exception)\b/i

function rawText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Verständlicher Satz zu einem Fehler: die Übersetzung einer bekannten
 * Datenbank-/Netzwerkmeldung, die eigene deutsche Meldung unverändert — oder
 * undefined, wenn es nur Technik ist.
 */
export function knownErrorText(err: unknown): string | undefined {
  const detail = rawText(err)
  const known = DB_MESSAGE_PATTERNS.find((p) => p.match.test(detail))
  if (known) {
    if (import.meta.env.DEV) console.warn('[Fehler] Originaltext:', detail)
    return known.text
  }
  if (!detail.trim() || TECHNICAL.test(detail)) {
    console.warn('[Fehler] Originaltext:', detail)
    return undefined
  }
  return detail
}

/** Standard message for failed writes; keeps wording consistent across screens. */
export function saveErrorMessage(err: unknown): string {
  const text = knownErrorText(err)
  return text ? `Speichern hat nicht geklappt: ${text}` : 'Speichern hat nicht geklappt. Versuch es noch einmal.'
}

/** Zweite Zeile unter „Daten konnten nicht geladen werden." */
export function loadErrorMessage(err: unknown): string {
  return knownErrorText(err) ?? 'Prüf die Verbindung und versuch es noch einmal.'
}
