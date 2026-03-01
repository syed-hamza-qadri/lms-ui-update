/**
 * Cache utilities for Next.js API routes
 */

export const cacheHeaders = {
  // No cache - for sensitive auth data
  noCache: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
  
  // Short cache - 5 minutes for frequently accessed data
  short: {
    'Cache-Control': 'public, max-age=300, s-maxage=300',
  },
  
  // Medium cache - 1 hour for semi-static data
  medium: {
    'Cache-Control': 'public, max-age=3600, s-maxage=3600',
  },
  
  // Long cache - 1 day for static data
  long: {
    'Cache-Control': 'public, max-age=86400, s-maxage=86400',
  },
  
  // ISR - Incremental Static Regeneration
  isr: {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
  },
}

/**
 * Generate cache key for data
 */
export function getCacheKey(prefix: string, ...args: any[]): string {
  return `${prefix}:${JSON.stringify(args)}`
}

/**
 * Memory cache for simple in-process caching
 */
const memoryCache = new Map<string, { data: any; expires: number }>()

export function setMemoryCache(key: string, data: any, ttlSeconds = 300) {
  memoryCache.set(key, {
    data,
    expires: Date.now() + ttlSeconds * 1000,
  })
}

export function getMemoryCache(key: string): any | null {
  const cached = memoryCache.get(key)
  if (!cached) return null
  
  if (cached.expires < Date.now()) {
    memoryCache.delete(key)
    return null
  }
  
  return cached.data
}

export function clearMemoryCache() {
  memoryCache.clear()
}
