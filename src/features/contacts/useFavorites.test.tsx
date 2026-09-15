import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

// Frisches Repository je Testfall statt des Mock-Singletons (siehe pageHarness).
vi.mock('@/data/repositoryProvider', () => import('@/test/pageHarness'))

import { resetHarness } from '@/test/pageHarness'
import { ToastProvider } from '@/components/ui/toast'
import { useFavorites } from './useFavorites'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Der Hook meldet Fehler per Toast und braucht dafür den Provider.
const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>

describe('useFavorites', () => {
  it('lädt die Sterne des Nutzers und schaltet sie optimistisch um', async () => {
    const repo = resetHarness()
    await repo.addFavorite('u-alex', 'c-anke')

    const { result } = renderHook(() => useFavorites('u-alex'), { wrapper })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isFavorite('c-anke')).toBe(true)
    expect(result.current.isFavorite('c-thomas')).toBe(false)

    await act(() => result.current.toggle('c-thomas'))
    expect(result.current.isFavorite('c-thomas')).toBe(true)
    expect((await repo.listFavorites('u-alex')).sort()).toEqual(['c-anke', 'c-thomas'])

    await act(() => result.current.toggle('c-anke'))
    expect(result.current.isFavorite('c-anke')).toBe(false)
    expect(await repo.listFavorites('u-alex')).toEqual(['c-thomas'])
  })

  it('zeigt den Stern sofort und nimmt ihn zurück, wenn das Speichern scheitert', async () => {
    const repo = resetHarness()
    const save = deferred<void>()
    vi.spyOn(repo, 'addFavorite').mockReturnValue(save.promise)

    const { result } = renderHook(() => useFavorites('u-alex'), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let pending!: Promise<void>
    act(() => {
      pending = result.current.toggle('c-anke')
    })
    // Optimistisch: der Stern steht, bevor der Server geantwortet hat.
    expect(result.current.isFavorite('c-anke')).toBe(true)

    save.reject(new Error('RLS: permission denied'))
    await act(() => pending)

    expect(result.current.isFavorite('c-anke')).toBe(false)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Speichern fehlgeschlagen: RLS: permission denied',
    )
    expect(await repo.listFavorites('u-alex')).toEqual([])
  })

  it('ignoriert Klicks, bis die Liste geladen ist', async () => {
    // Sonst überschriebe die eintreffende Liste den optimistischen Stand.
    const repo = resetHarness()
    const load = deferred<string[]>()
    vi.spyOn(repo, 'listFavorites').mockReturnValue(load.promise)

    const { result } = renderHook(() => useFavorites('u-alex'), { wrapper })
    await act(() => result.current.toggle('c-anke'))
    expect(result.current.isFavorite('c-anke')).toBe(false)

    load.resolve(['c-thomas'])
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isFavorite('c-thomas')).toBe(true)
    expect(result.current.isFavorite('c-anke')).toBe(false)
  })
})
