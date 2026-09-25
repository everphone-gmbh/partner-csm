import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CircleCheck, CircleX } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'error' | 'success'

interface ToastItem {
  id: string
  message: string
  variant: ToastVariant
}

interface ToastApi {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** Minimal toast layer for write-error/success feedback (no dependency). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const toast = useCallback((message: string, variant: ToastVariant = 'error') => {
    const id = crypto.randomUUID()
    setItems((list) => [...list, { id, message, variant }])
    window.setTimeout(() => {
      setItems((list) => list.filter((t) => t.id !== id))
    }, 6000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="assertive"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={cn(
              'pointer-events-auto flex max-w-md items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg',
              t.variant === 'error'
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900',
            )}
          >
            {t.variant === 'error' ? (
              <CircleX className="mt-0.5 size-4 shrink-0" />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0" />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

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
    text: 'Keine Verbindung zum Server. Bitte noch einmal versuchen.',
  },
]

/**
 * Standard message for failed writes; keeps wording consistent across screens.
 *
 * Eigene, bereits verständliche Meldungen (z. B. „Kein Zugriff") reicht die
 * Funktion unverändert durch — übersetzt wird nur, was erkennbar von der
 * Datenbank oder dem Netzwerk kommt.
 */
export function saveErrorMessage(err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err)
  const known = DB_MESSAGE_PATTERNS.find((p) => p.match.test(detail))
  if (!known) return `Speichern fehlgeschlagen: ${detail}`
  if (import.meta.env.DEV) console.warn('[saveErrorMessage] Originaltext:', detail)
  return `Speichern fehlgeschlagen: ${known.text}`
}
