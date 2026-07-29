import { useEffect, useState } from 'react'
import { fileStore } from './fileStore'

/**
 * Löst eine gespeicherte Bild-/Audio-Referenz in eine anzeigbare URL auf.
 *
 * Data-URLs kommen synchron im ersten Rendern zurück (kein Flackern im
 * Demo-Modus); Storage-Referenzen brauchen einen signierten Link und
 * erscheinen daher einen Tick später. Schlägt das Auflösen fehl — fehlende
 * Datei oder fehlende Berechtigung — bleibt das Ergebnis undefined, und die
 * aufrufende Komponente zeigt ihren Platzhalter.
 */
export function useFileUrl(ref?: string | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() =>
    ref && !ref.startsWith('storage:') ? ref : undefined,
  )

  useEffect(() => {
    if (!ref) {
      setUrl(undefined)
      return
    }
    if (!ref.startsWith('storage:')) {
      setUrl(ref)
      return
    }
    let active = true
    fileStore.resolve(ref).then(
      (next) => {
        if (active) setUrl(next)
      },
      () => {
        if (active) setUrl(undefined)
      },
    )
    return () => {
      active = false
    }
  }, [ref])

  return url
}
