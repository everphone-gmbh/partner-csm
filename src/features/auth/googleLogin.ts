// Google-Anmeldung auf der Login-Seite (0040) — ausgelagert, damit LoginPage.tsx
// nur die Komponente exportiert.

/**
 * Google-Anmeldung — für alle sichtbar seit 29.09. (Rücksprung auf dem
 * Google-Client von devops eingetragen, Client steht auf „Intern", Test mit
 * Janniks Konto: landet im bestehenden Konto). Auf false gestellt wäre der Knopf
 * wieder nur mit `?google=1` in der Adresse zu sehen — der Weg zum Testen, falls
 * am Google-Client etwas umgebaut wird.
 */
export const GOOGLE_LOGIN_LIVE = true

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
