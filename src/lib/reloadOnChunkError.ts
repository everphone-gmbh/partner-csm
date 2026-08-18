/**
 * Nach einem Deploy existieren die alten, gehashten Chunk-Dateien nicht mehr —
 * ein Tab mit der Vorversion läuft dann beim Nachladen einer Seite ins Leere
 * („Failed to fetch dynamically imported module“). Das trifft die RMs
 * regelmäßig, weil das Tool bei ihnen den ganzen Tag offen ist.
 *
 * Vite meldet genau diesen Fall als `vite:preloadError`. Wir laden die Seite
 * dann einmal automatisch neu — der Tab holt sich damit die aktuelle Version
 * (der Service Worker ist network-first, liefert also frisch). Die
 * Session-Sperre verhindert eine Reload-Schleife, falls Neuladen nicht hilft
 * (z. B. offline): dann läuft der Fehler normal weiter und die ErrorBoundary
 * zeigt wie bisher „Neu laden“.
 */
const GUARD_KEY = 'chunk-reload-at'
const GUARD_WINDOW_MS = 30_000

export function installChunkReloadHandler(
  reload: () => void = () => window.location.reload(),
) {
  window.addEventListener('vite:preloadError', (event) => {
    const last = Number(sessionStorage.getItem(GUARD_KEY) ?? 0)
    if (Date.now() - last < GUARD_WINDOW_MS) return
    event.preventDefault()
    sessionStorage.setItem(GUARD_KEY, String(Date.now()))
    reload()
  })
}
