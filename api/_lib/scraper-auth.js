import { timingSafeEqual } from 'node:crypto'

function headerValue(headers, name) {
  if (!headers) return ''
  if (typeof headers.get === 'function') return headers.get(name) || ''
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase())
  const value = key ? headers[key] : ''
  return Array.isArray(value) ? value[0] || '' : String(value || '')
}

function safeEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
}

export function isScraperAuthorized(req, expectedKey = process.env.SCRAPER_API_KEY) {
  if (!expectedKey || String(expectedKey).length < 24) return false
  const direct = headerValue(req?.headers, 'x-scraper-key').trim()
  const bearer = headerValue(req?.headers, 'authorization').replace(/^Bearer\s+/i, '').trim()
  return safeEqual(direct || bearer, String(expectedKey))
}

export function requireScraperAuthorization(req, res) {
  if (isScraperAuthorized(req)) return true
  res.status(401).json({ error: 'unauthorized' })
  return false
}
