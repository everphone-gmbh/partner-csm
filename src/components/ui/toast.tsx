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

/** Standard message for failed writes; keeps wording consistent across screens. */
export function saveErrorMessage(err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err)
  return `Speichern fehlgeschlagen: ${detail}`
}
