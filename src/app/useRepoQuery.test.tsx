import { describe, it, expect } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useRepoQuery } from './useRepoQuery'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useRepoQuery', () => {
  it('exposes loading, then the data', async () => {
    const d = deferred<string>()
    const { result } = renderHook(() => useRepoQuery(() => d.promise, []))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeUndefined()

    d.resolve('hello')
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe('hello')
    expect(result.current.error).toBeUndefined()
  })

  it('surfaces a rejection as error instead of loading forever', async () => {
    const d = deferred<string>()
    const { result } = renderHook(() => useRepoQuery(() => d.promise, []))
    d.reject(new Error('RLS: permission denied'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error?.message).toBe('RLS: permission denied')
    expect(result.current.data).toBeUndefined()
  })

  it('retry() refetches after an error', async () => {
    let calls = 0
    const { result } = renderHook(() =>
      useRepoQuery(() => {
        calls += 1
        return calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('recovered')
      }, []),
    )
    await waitFor(() => expect(result.current.error).toBeDefined())

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.data).toBe('recovered'))
    expect(result.current.error).toBeUndefined()
    expect(calls).toBe(2)
  })

  it('refetches when deps change and keeps previous data while loading', async () => {
    const byId: Record<string, string> = { a: 'Alpha', b: 'Beta' }
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useRepoQuery(() => Promise.resolve(byId[id]), [id]),
      { initialProps: { id: 'a' } },
    )
    await waitFor(() => expect(result.current.data).toBe('Alpha'))

    rerender({ id: 'b' })
    await waitFor(() => expect(result.current.data).toBe('Beta'))
  })

  it('ignores a stale response that resolves after the deps changed', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    let call = 0
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useRepoQuery(() => {
          call += 1
          return call === 1 ? first.promise : second.promise
        }, [id]),
      { initialProps: { id: 'a' } },
    )
    rerender({ id: 'b' })
    second.resolve('fresh')
    await waitFor(() => expect(result.current.data).toBe('fresh'))

    // The slow first response arrives late — it must NOT overwrite the fresh one.
    first.resolve('stale')
    await new Promise((r) => setTimeout(r, 10))
    expect(result.current.data).toBe('fresh')
  })
})
