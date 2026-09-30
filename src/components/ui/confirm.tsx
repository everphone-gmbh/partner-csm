import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from './button'
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from './useConfirm'

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

/**
 * Rückfragen im Stil der App statt `window.confirm`. Der Browser-Dialog hat
 * immer „OK/Abbrechen", sieht in jedem Browser anders aus und kann die Handlung
 * nicht benennen — bei „Kontakt löschen" ist genau das wichtig.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  )
  const close = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialog {...pending} onClose={close} />}
    </ConfirmContext.Provider>
  )
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Abbrechen',
  tone = 'default',
  onClose,
}: ConfirmOptions & { onClose: (ok: boolean) => void }) {
  const titleId = useId()
  const messageId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Beim Löschen liegt der Fokus auf „Abbrechen": ein versehentliches Enter
    // soll nichts vernichten.
    ;(tone === 'danger' ? cancelRef : confirmRef).current?.focus()
    return () => previous?.focus()
  }, [tone])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose(false)
      return
    }
    if (e.key === 'Tab') {
      // Nur zwei Knöpfe — der Fokus pendelt zwischen ihnen.
      e.preventDefault()
      const next = document.activeElement === cancelRef.current ? confirmRef : cancelRef
      next.current?.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => onClose(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-black/[0.05] bg-card p-5 text-card-foreground shadow-xl dark:border-white/[0.08]"
      >
        <h2 id={titleId} className="text-base font-semibold leading-snug">
          {title}
        </h2>
        {message && (
          <div id={messageId} className="mt-1.5 text-sm text-muted-foreground">
            {message}
          </div>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} type="button" variant="outline" onClick={() => onClose(false)}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'default'}
            onClick={() => onClose(true)}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
