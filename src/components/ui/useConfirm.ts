import { createContext, useContext, type ReactNode } from 'react'

export interface ConfirmOptions {
  /** Die Frage, z. B. „Anke Richter löschen?". */
  title: string
  /** Was danach passiert — vor allem, wenn es sich nicht rückgängig machen lässt. */
  message?: ReactNode
  /** Nennt die Handlung: „Kontakt löschen", nie „OK". */
  confirmLabel: string
  /** Standard „Abbrechen"; bei Löschen oft besser „Behalten". */
  cancelLabel?: string
  /** `danger`: roter Knopf, Fokus liegt auf Abbrechen. */
  tone?: 'danger' | 'default'
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * `await confirm({...})` liefert true, wenn bestätigt wurde. Ohne Provider (in
 * Tests mit nackter Seite) fällt es auf `window.confirm` zurück.
 */
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext) ?? fallbackConfirm
}

function fallbackConfirm(options: ConfirmOptions): Promise<boolean> {
  const text = typeof options.message === 'string' ? `${options.title}\n\n${options.message}` : options.title
  return Promise.resolve(window.confirm(text))
}
