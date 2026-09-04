import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface UnsavedChangesDialogProps {
  onSave: () => void
  onDiscard: () => void
  onStay: () => void
  /** Speichern läuft — Knöpfe gesperrt, Beschriftung „Speichern…“. */
  saving?: boolean
  /** false, wenn das Formular so nicht speicherbar ist (z. B. Pflichtfeld leer). */
  canSave?: boolean
}

/**
 * Rückfrage beim Verlassen mit ungespeicherten Änderungen: Speichern /
 * Verwerfen / Zurück. Bewusst ohne Dialog-Primitive gebaut (das Projekt hat
 * keine): role="dialog" + aria-modal, der Fokus wandert hinein und bleibt dort
 * (Tab-Kreis), Escape und Klick auf den Hintergrund heißen „Zurück“, beim
 * Schließen kehrt der Fokus zum zuvor fokussierten Element zurück.
 */
export function UnsavedChangesDialog({
  onSave,
  onDiscard,
  onStay,
  saving = false,
  canSave = true,
}: UnsavedChangesDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const stayRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // „Zurück“ ist die sichere Vorgabe: Enter aus Versehen verliert nichts.
    stayRef.current?.focus()
    return () => previous?.focus()
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (!saving) onStay()
      return
    }
    if (e.key !== 'Tab' || !panelRef.current) return
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const keepOpen = (e: MouseEvent) => e.stopPropagation()

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={() => {
        if (!saving) onStay()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={onKeyDown}
        onClick={keepOpen}
        className="w-full max-w-sm rounded-2xl border border-black/[0.05] bg-card p-5 text-card-foreground shadow-[var(--shadow-card)] dark:border-white/[0.08]"
      >
        <h2 id={titleId} className="text-base font-semibold tracking-tight">
          Ungespeicherte Änderungen
        </h2>
        <p id={descriptionId} className="mt-1.5 text-sm text-muted-foreground">
          Diese Änderungen sind noch nicht gespeichert. Beim Verlassen ohne Speichern gehen sie
          verloren.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={stayRef}
            type="button"
            onClick={onStay}
            disabled={saving}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            Zurück
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'text-destructive hover:text-destructive',
            )}
          >
            Verwerfen
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !canSave}
            title={canSave ? undefined : 'Pflichtfelder fehlen — erst ausfüllen oder verwerfen'}
            className={buttonVariants({ size: 'sm' })}
          >
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
