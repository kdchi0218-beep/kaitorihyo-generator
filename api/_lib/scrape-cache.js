import { createHash } from 'node:crypto'

export function makeScrapeCacheKey(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

function normalizeIdentifier(value, field, maxLength) {
  const text = String(value || '').trim()
  if (!text || text.length > maxLength || !/^[a-z0-9_:-]+$/i.test(text)) {
    throw new Error(`invalid ${field}`)
  }
  return text
}

export function createScrapeCache({ fetchImpl = fetch, env = process.env, now = () => Date.now() } = {}) {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
  const secret = env.SUPABASE_SECRET_KEY || ''
  const configured = Boolean(supabaseUrl && secret)

  function headers(extra = {}) {
    return {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...extra,
    }
  }

  return {
    configured,

    async get(sourceValue, cacheKeyValue) {
      if (!configured) return null
      const source = normalizeIdentifier(sourceValue, 'source', 80)
      const cacheKey = normalizeIdentifier(cacheKeyValue, 'cache key', 128)
      const query = new URLSearchParams({
        select: 'payload',
        source: `eq.${source}`,
        cache_key: `eq.${cacheKey}`,
        expires_at: `gt.${new Date(now()).toISOString()}`,
        limit: '1',
      })

      try {
        const response = await fetchImpl(`${supabaseUrl}/rest/v1/scrape_cache?${query}`, {
          method: 'GET',
          headers: headers(),
        })
        if (!response.ok) return null
        const rows = await response.json()
        return Array.isArray(rows) && rows[0] ? rows[0].payload ?? null : null
      } catch {
        return null
      }
    },

    async set(sourceValue, cacheKeyValue, payload, ttlSeconds) {
      if (!configured) return false
      const source = normalizeIdentifier(sourceValue, 'source', 80)
      const cacheKey = normalizeIdentifier(cacheKeyValue, 'cache key', 128)
      const ttl = Number(ttlSeconds)
      if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 604_800) throw new Error('invalid cache ttl')
      const timestamp = new Date(now())

      try {
        const response = await fetchImpl(`${supabaseUrl}/rest/v1/scrape_cache`, {
          method: 'POST',
          headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify({
            source,
            cache_key: cacheKey,
            payload,
            scraped_at: timestamp.toISOString(),
            expires_at: new Date(timestamp.getTime() + ttl * 1000).toISOString(),
          }),
        })
        return response.ok
      } catch {
        return false
      }
    },
  }
}

export const scrapeCache = createScrapeCache()
