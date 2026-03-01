'use client'

import { useEffect, useState } from 'react'

interface SessionData {
  user_id: string
  user_name: string
  user_role: string
}

let sessionCache: SessionData | null = null
let cacheTime = 0
let lastToken = ''
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export function useSession() {
  const [userId, setUserId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<SessionData | null>(null)

  useEffect(() => {
    const validateSession = async () => {
      try {
        // Get current token from cookie to detect session changes
        const currentToken = document.cookie
          .split('; ')
          .find((row) => row.startsWith('session_token='))
          ?.split('=')[1]

        // If token changed (new login/logout), clear cache
        if (currentToken !== lastToken) {
          sessionCache = null
          cacheTime = 0
          lastToken = currentToken || ''
        }

        // Check if we have cached session data (within 5 minutes)
        if (sessionCache && (Date.now() - cacheTime) < CACHE_DURATION) {
          setUserId(sessionCache.user_id)
          setToken('authenticated')
          setSession(sessionCache)
          setLoading(false)
          return
        }

        // Call server endpoint to validate session from HttpOnly cookie
        const response = await fetch('/api/sessions/validate', {
          credentials: 'include', // Include HttpOnly cookies
        })

        if (response.ok) {
          const data = await response.json()
          const sessionData: SessionData = {
            user_id: data.user_id,
            user_name: data.user_name || 'User',
            user_role: data.user_role || 'caller',
          }
          
          // Update cache
          sessionCache = sessionData
          cacheTime = Date.now()
          
          setUserId(sessionData.user_id)
          setToken('authenticated') // Not the actual token, just a flag
          setSession(sessionData)
        } else {
          // Session invalid or expired - clear cache
          sessionCache = null
          setUserId(null)
          setToken(null)
          setSession(null)
        }
      } catch (error) {
        console.error('[Session] Validation error:', error)
        sessionCache = null
        setUserId(null)
        setToken(null)
        setSession(null)
      } finally {
        setLoading(false)
      }
    }

    validateSession()
  }, [])

  return { userId, token, loading, session }
}

export function getStoredToken(): string | null {
  // This function is deprecated - session is now server-side only
  return null
}

export function getStoredUserId(): string | null {
  // This function is deprecated - session is now server-side only
  return null
}
