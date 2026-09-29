// Google-Anmeldung auf der Login-Seite (0040) — ausgelagert, damit LoginPage.tsx
// nur die Komponente exportiert.

/**
 * Google-Anmeldung. In Supabase ist Google eingeschaltet; bis devops den
 * Rücksprung auf dem Google-Client eingetragen hat, liefe der Knopf in einen
 * Google-Fehler. Deshalb vorerst nur mit `?google=1` in der Adresse sichtbar —
 * zum Testen. Steht der Eintrag, hier auf true.
 */
export const GOOGLE_LOGIN_LIVE = false

export function googleLoginVisible(): boolean {
  return GOOGLE_LOGIN_LIVE || new URLSearchParams(window.location.search).has('google')
}

/**
 * Fehler, mit dem Supabase von einer abgewiesenen Google-Anmeldung zurückkommt
 * (`#error_description=…`, beim PKCE-Weg `?error_description=…`). Beim Laden des
 * Moduls gelesen, bevor irgendetwas die Adresse aufräumt.
 */
function readReturnError(): string | undefined {
  if (typeof window === 'undefined') return undefined
  for (const raw of [window.location.hash.replace(/^#/, ''), window.location.search.replace(/^\?/, '')]) {
    const params = new URLSearchParams(raw)
    const message = params.get('error_description') ?? params.get('error')
    if (message) return message
  }
  return undefined
}

export function friendlyReturnError(message: string): string {
  // Den Riegel aus 0040 (nur everphone.de legt Konten an) meldet Supabase nur
  // als „Database error saving new user".
  if (/database error saving new user|everphone\.de/i.test(message)) {
    return 'Die Anmeldung geht nur mit einem everphone.de-Konto.'
  }
  if (/access.?denied/i.test(message)) return 'Die Google-Anmeldung wurde abgebrochen.'
  return `Die Google-Anmeldung hat nicht geklappt: ${message}`
}

/** Rücksprung-Fehler dieses Seitenaufrufs, einmal beim Laden gelesen. */
export const RETURN_ERROR = readReturnError()
