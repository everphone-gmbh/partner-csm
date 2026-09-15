import { useCallback, useEffect, useRef, useState } from 'react'
import { repository } from '@/data/repositoryProvider'
import { saveErrorMessage, useToast } from '@/components/ui/toast'

export interface Favorites {
  /** Markierte Kontakt-IDs des Nutzers. */
  ids: Set<string>
  /** true, bis die Liste einmal geladen ist. */
  loading: boolean
  isFavorite: (contactId: string) => boolean
  /** Setzt oder entfernt den Stern — optimistisch, mit Rücknahme bei Fehler. */
  toggle: (contactId: string) => Promise<void>
}

/**
 * Favoriten des angemeldeten Nutzers (Migration 0031; Feedback #6).
 *
 * Der Stern reagiert sofort (optimistisch) und wird zurückgenommen, wenn das
 * Speichern scheitert — dann mit Toast, wie überall bei fehlgeschlagenen
 * Schreibzugriffen. Die Nutzer-ID kommt vom Aufrufer (`useSession().user.id`),
 * nicht aus dem Hook: das hält ihn frei von der Sitzung und testbar mit
 * `renderHook`.
 */
export function useFavorites(userId: string): Favorites {
  const { toast } = useToast()
  const [ids, setIds] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(true)
  // Spiegel des Zustands für toggle: zwei schnelle Klicks läsen sonst denselben
  // veralteten Stand aus der Closure und setzten den Stern doppelt.
  const idsRef = useRef(ids)
  const commit = useCallback((next: Set<string>) => {
    idsRef.current = next
    setIds(next)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    repository.listFavorites(userId).then(
      (list) => {
        if (!active) return
        commit(new Set(list))
        setLoading(false)
      },
      (err: unknown) => {
        if (!active) return
        // Lesefehler (z. B. Tabelle noch nicht angelegt) sollen die Liste nicht
        // blockieren: Sterne bleiben leer, der Rest der Seite funktioniert.
        setLoading(false)
        toast(
          `Favoriten konnten nicht geladen werden: ${err instanceof Error ? err.message : String(err)}`,
        )
      },
    )
    return () => {
      active = false
    }
  }, [userId, commit, toast])

  const isFavorite = useCallback((contactId: string) => ids.has(contactId), [ids])

  const toggle = useCallback(
    async (contactId: string) => {
      // Vor dem ersten Laden nichts tun: die eintreffende Liste überschriebe
      // sonst den optimistischen Stand.
      if (loading) return
      const was = idsRef.current.has(contactId)
      const next = new Set(idsRef.current)
      if (was) next.delete(contactId)
      else next.add(contactId)
      commit(next)
      try {
        if (was) await repository.removeFavorite(userId, contactId)
        else await repository.addFavorite(userId, contactId)
      } catch (err) {
        // Rücknahme auf Basis des AKTUELLEN Stands, nicht des Schnappschusses:
        // dazwischen kann ein anderer Stern gesetzt worden sein.
        const back = new Set(idsRef.current)
        if (was) back.add(contactId)
        else back.delete(contactId)
        commit(back)
        toast(saveErrorMessage(err))
      }
    },
    [userId, loading, commit, toast],
  )

  return { ids, loading, isFavorite, toggle }
}
