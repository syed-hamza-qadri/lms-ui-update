import { createBrowserClient } from '@supabase/ssr'

/**
 * @deprecated Use `useSupabaseClient()` hook from @/lib/supabase-context instead
 * This function is kept for backward compatibility but may create multiple instances
 * 
 * In client components, import and use:
 * import { useSupabaseClient } from '@/lib/supabase-context'
 * const supabase = useSupabaseClient()
 */
export function getSupabaseClient() {
  if (typeof window === 'undefined') {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      throw new Error('Missing Supabase environment variables')
    }

    return createBrowserClient(url, key)
  }

  throw new Error(
    'getSupabaseClient() should not be called in the browser. ' +
    'Use useSupabaseClient() hook from @/lib/supabase-context instead.'
  )
}

