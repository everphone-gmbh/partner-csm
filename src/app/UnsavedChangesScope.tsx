import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

interface Entry {
  isDirty: boolean
  canSave: boolean
  onSave: () => Promise<boolean | void>
}

interface Registry {
  set(key: string, entry: Entry): void
  remove(key: string): void
}

const RegistryContext = createContext<Registry | null>(null)

/**
 * Eine Seite, viele Karten mit eigenem Eingabestand — aber nur EIN Wächter.
 *
 * Der Daten-Router kennt genau einen aktiven Blocker pro Seite (der zuletzt
 * registrierte gewinnt). Solange nur die Stammdaten-Karte den Wächter trug,
 * gingen Eingaben auf den übrigen Karten beim Wegklicken still verloren:
 * ein getippter, aber noch nicht hinzugefügter Anknüpfungspunkt, eine Notiz
 * vor dem Verlassen des Feldes — und ein per Sprachmemo diktierter Eintrag, der
 * im Composer steht, bis man „Eintrag speichern" drückt.
 *
 * Diese Klammer hält den einen Wächter. Karten melden sich mit
 * `useUnsavedChangesEntry` an; ist irgendeine „schmutzig", greift die Rückfrage
 * Speichern / Verwerfen / Zurück, und „Speichern" speichert alle angemeldeten
 * Karten der Reihe nach. Scheitert eine, bleibt man auf der Seite.
 */
export function UnsavedChangesScope({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<string, Entry>())
  // Die Einträge liegen in einer Ref, damit ein Tastendruck in einer Karte
  // nicht die ganze Seite neu aufbaut. Neu gerendert wird nur, wenn sich an
  // „schmutzig" oder „speicherbar" wirklich etwas ändert.
  const [, setVersion] = useState(0)

  const registry = useMemo<Registry>(
    () => ({
      set(key, entry) {
        const prev = entries.current.get(key)
        entries.current.set(key, entry)
        if (!prev || prev.isDirty !== entry.isDirty || prev.canSave !== entry.canSave) {
          setVersion((v) => v + 1)
        }
      },
      remove(key) {
        if (entries.current.delete(key)) setVersion((v) => v + 1)
      },
    }),
    [],
  )

  const dirty = [...entries.current.values()].filter((e) => e.isDirty)
  const { dialog } = useUnsavedChangesGuard({
    isDirty: dirty.length > 0,
    canSave: dirty.every((e) => e.canSave),
    onSave: async () => {
      // Zum Zeitpunkt des Klicks neu lesen, nicht die Liste vom letzten Rendern.
      for (const entry of [...entries.current.values()]) {
        if (!entry.isDirty) continue
        const ok = await entry.onSave()
        if (ok === false) return false
      }
      return true
    },
  })

  return (
    <RegistryContext.Provider value={registry}>
      {children}
      {dialog}
    </RegistryContext.Provider>
  )
}

/**
 * Meldet eine Karte bei der umgebenden `UnsavedChangesScope` an.
 *
 * `isDirty` bitte ohne laufendes Speichern rechnen (`!saving`), sonst würde
 * die Navigation direkt NACH einem erfolgreichen Speichern noch einmal
 * abgefangen. `onSave` löst auf (oder mit `true`), wenn gespeichert wurde;
 * `false` oder ein Fehler bedeutet: bleiben.
 *
 * Außerhalb einer Klammer tut der Hook nichts — die Karte hat dann schlicht
 * keinen Wächter.
 */
export function useUnsavedChangesEntry(
  key: string,
  {
    isDirty,
    onSave,
    canSave = true,
  }: { isDirty: boolean; onSave: () => Promise<boolean | void>; canSave?: boolean },
) {
  const registry = useContext(RegistryContext)
  // Die Speicherfunktion wechselt bei jedem Rendern ihre Identität; gebraucht
  // wird sie erst beim Klick im Dialog. Deshalb die jeweils neueste in einer Ref.
  const saveRef = useRef(onSave)
  useLayoutEffect(() => {
    saveRef.current = onSave
  })

  useEffect(() => {
    registry?.set(key, { isDirty, canSave, onSave: () => saveRef.current() })
  }, [registry, key, isDirty, canSave])

  useEffect(() => () => registry?.remove(key), [registry, key])
}
