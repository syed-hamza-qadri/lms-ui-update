import { createBrowserClient } from '@supabase/ssr'

let supabaseClient: ReturnType<typeof createBrowserClient> | null = null

// Ensure singleton pattern with browser context check
function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }

  return createBrowserClient(url, key)
}

export function getSupabaseClient() {
  // Only create once per browser session
  if (typeof window === 'undefined') {
    return createClient()
  }

  if (!supabaseClient) {
    supabaseClient = createClient()
  }

  return supabaseClient
}
