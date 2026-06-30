import type { Repository } from './repository'
import { mockRepository } from './mockRepository'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { SupabaseRepository } from './supabaseRepository'

const env = import.meta.env as unknown as Record<string, string | undefined>

// Only use Supabase when explicitly opted in AND credentials exist. The demo
// stays on the in-memory mock until we set VITE_DATA_BACKEND=supabase after the
// schema is live and the adapter is verified end-to-end.
const useSupabase = env.VITE_DATA_BACKEND === 'supabase' && isSupabaseConfigured && supabase != null

export const activeBackend: 'supabase' | 'mock' = useSupabase ? 'supabase' : 'mock'

/**
 * Single source of truth for which Repository the app uses.
 * NOTE: screens currently import `mockRepository` directly. Pointing them at
 * this `repository` export is the one-line swap once the backend is verified.
 */
export const repository: Repository =
  useSupabase && supabase ? new SupabaseRepository(supabase) : mockRepository
