import { useCallback, useEffect, useState, type DependencyList } from 'react'

export interface RepoQuery<T> {
  data: T | undefined
  loading: boolean
  error: Error | undefined
  /** Refetch (e.g. after a failed load, or to refresh after a write). */
  retry: () => void
}

/**
 * The one way screens read from the Repository: wraps a fetcher in
 * loading/error/retry state so a failed request surfaces an error UI instead
 * of an eternal spinner (the mock can never fail — Supabase can and will).
 *
 * - Stale responses are dropped (deps changed or unmounted before resolve).
 * - Previous data is kept while a refetch is in flight (no flicker).
 */
export function useRepoQuery<T>(fetcher: () => Promise<T>, deps: DependencyList): RepoQuery<T> {
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: Error }>({
    loading: true,
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setState((s) => ({ ...s, loading: true, error: undefined }))
    fetcher().then(
      (data) => {
        if (active) setState({ data, loading: false })
      },
      (err: unknown) => {
        if (active)
          setState((s) => ({
            data: s.data,
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          }))
      },
    )
    return () => {
      active = false
    }
    // The caller-provided deps array IS the dependency list (plus retry attempts).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])

  return { data: state.data, loading: state.loading, error: state.error, retry }
}
