import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Vite exposes only VITE_-prefixed vars to the client. The anon key is safe for
// the browser; RLS does the real enforcement. The service-role key is never here.
const env = import.meta.env as unknown as Record<string, string | undefined>
const url = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY

/** When false, the app falls back to the in-memory mock repository. */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
