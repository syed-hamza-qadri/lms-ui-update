'use client'

import { createContext, useContext, useMemo, ReactNode } from 'react'
import { createBrowserClient } from '@supabase/ssr'

type SupabaseClient = ReturnType<typeof createBrowserClient>

const SupabaseContext = createContext<SupabaseClient | null>(null)

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const supabaseClient = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      throw new Error('Missing Supabase environment variables')
    }

    return createBrowserClient(url, key)
  }, [])

  return (
    <SupabaseContext.Provider value={supabaseClient}>
      {children}
    </SupabaseContext.Provider>
  )
}

export function useSupabaseClient() {
  const client = useContext(SupabaseContext)
  if (!client) {
    throw new Error('useSupabaseClient must be used within SupabaseProvider')
  }
  return client
}
