import { useEffect, useState, type ReactNode } from 'react'
import { useBlocker } from 'react-router-dom'
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog'

export interface UnsavedChangesGuardOptions {
  /**
   * Gibt es Eingaben, die noch nicht gespeichert sind? Bewusst als Wert statt
   * Funktion: der Aufrufer rechnet ihn aus seinem Zustand aus und nimmt dabei
   * `!saving` mit hinein — sonst würde die Navigation direkt NACH einem
   * erfolgreichen Speichern noch einmal abgefangen.
   */
  isDirty: boolean
  /**
   * „Speichern“ im Dialog. Auflösen (oder `true`) = gespeichert, die Navigation
   * läuft weiter; `false` oder ein Fehler = bleiben. Fehler meldet der Aufrufer
   * selbst (Toast), der Dialog schließt sich und die Eingaben bleiben stehen.
   */
  onSave: () => Promise<boolean | void>
  /** false sperrt „Speichern“ im Dialog (Pflichtfeld leer); Vorgabe true. */
  canSave?: boolean
}

export interface UnsavedChangesGuard {
  /** Der Dialog, sobald eine Navigation abgefangen wurde — sonst null. In die Ausgabe einhängen. */
  dialog: ReactNode
  /** true, während der Dialog offen ist. */
  blocked: boolean
}

/**
 * Wächter gegen Datenverlust beim Bearbeiten (Feedback #1, kein Autosave):
 *
 * 1. Tab schließen / neu laden → Browser-Warnung (`beforeunload`), solange
 *    ungespeicherte Änderungen vorliegen.
 * 2. Navigation innerhalb der App (Links, Menü, Suche) → abgefangen mit
 *    `useBlocker`; die Rückfrage bietet Speichern / Verwerfen / Zurück.
 *
 * `useBlocker` braucht den Daten-Router — App.tsx nutzt deshalb
 * `createBrowserRouter`, das Testgerüst `createMemoryRouter`. Der Router kennt
 * nur EINEN aktiven Blocker (der zuletzt registrierte gewinnt, Warnung in der
 * Entwicklung); pro Seite darf der Wächter also nur an einer Stelle hängen.
 */
export function useUnsavedChangesGuard({
  isDirty,
  onSave,
  canSave = true,
}: UnsavedChangesGuardOptions): UnsavedChangesGuard {
  const blocker = useBlocker(isDirty)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isDirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Ältere Browser zeigen die Warnung nur mit gesetztem returnValue.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  const save = async () => {
    if (blocker.state !== 'blocked') return
    setSaving(true)
    try {
      const ok = await onSave()
      if (ok === false) blocker.reset()
      else blocker.proceed()
    } catch {
      blocker.reset()
    } finally {
      setSaving(false)
    }
  }

  const blocked = blocker.state === 'blocked'
  const dialog =
    blocker.state === 'blocked' ? (
      <UnsavedChangesDialog
        saving={saving}
        canSave={canSave}
        onSave={() => void save()}
        onDiscard={() => blocker.proceed()}
        onStay={() => blocker.reset()}
      />
    ) : null

  return { dialog, blocked }
}
