import type { Repository } from './repository'

const env = import.meta.env as unknown as Record<string, string | undefined>

// Only use Supabase when explicitly opted in AND credentials exist. The demo
// stays on the in-memory mock until we set VITE_DATA_BACKEND=supabase after the
// schema is live and the adapter is verified end-to-end.
const useSupabase =
  env.VITE_DATA_BACKEND === 'supabase' &&
  Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY)

export const activeBackend: 'supabase' | 'mock' = useSupabase ? 'supabase' : 'mock'

let backendPromise: Promise<Repository> | undefined

async function loadBackend(): Promise<Repository> {
  if (useSupabase) {
    const [{ SupabaseRepository }, { supabase }] = await Promise.all([
      import('./supabaseRepository'),
      import('@/lib/supabase'),
    ])
    if (supabase) return new SupabaseRepository(supabase)
    // Credentials vanished between env check and client creation — fail safe.
  }
  const { mockRepository } = await import('./mockRepository')
  return mockRepository
}

function backend(): Promise<Repository> {
  return (backendPromise ??= loadBackend())
}

/**
 * Single source of truth for which Repository the app uses.
 *
 * A synchronous facade over a lazily-imported backend: every Repository
 * method is async anyway, so callers are unaffected — but @supabase/supabase-js
 * (and, in supabase mode, the seed data) stays out of the initial bundle
 * instead of shipping both backends to every user.
 */
export const repository: Repository = new Proxy({} as Repository, {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined
    return (...args: unknown[]) =>
      backend().then((repo) => {
        const method = repo[prop as keyof Repository] as (...a: unknown[]) => unknown
        return method.apply(repo, args)
      })
  },
})
