import { useCallback, useState } from 'react'

/**
 * Für Knöpfe, die früher still gesperrt waren, solange eine Eingabe fehlte.
 * Jetzt bleiben sie klickbar: `check(fehlt)` merkt sich den Versuch und liefert
 * false, wenn etwas fehlt. Den Hinweis zeigt die Komponente mit
 * `tried && fehlt` — er verschwindet von selbst, sobald die Eingabe da ist.
 *
 * ```tsx
 * const hint = useMissingHint()
 * onClick={() => { if (!hint.check(!name.trim())) return; save() }}
 * {hint.tried && !name.trim() && <FieldHint>Gib einen Namen ein.</FieldHint>}
 * ```
 */
export function useMissingHint() {
  const [tried, setTried] = useState(false)
  const check = useCallback((missing: boolean) => {
    setTried(missing)
    return !missing
  }, [])
  const reset = useCallback(() => setTried(false), [])
  return { tried, check, reset }
}
