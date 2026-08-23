function firstHeader(value) {
  return String(value || '').split(',', 1)[0].trim().toLowerCase()
}

export function validateSameOriginJson(req) {
  const headers = req?.headers || {}
  const contentType = firstHeader(headers['content-type'])
  const mediaType = contentType.split(';', 1)[0].trim()
  if (mediaType !== 'application/json') {
    return { ok: false, status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', error: 'application/json only' }
  }

  const origin = String(headers.origin || '').trim()
  if (!origin) return { ok: false, status: 403, code: 'ORIGIN_REQUIRED', error: 'Origin header is required' }

  const host = firstHeader(headers['x-forwarded-host'] || headers.host)
  const forwardedProto = firstHeader(headers['x-forwarded-proto'])
  let parsed
  try { parsed = new URL(origin) } catch {
    return { ok: false, status: 403, code: 'ORIGIN_NOT_ALLOWED', error: 'Origin is not allowed' }
  }
  const protocolAllowed = parsed.protocol === 'https:' || parsed.protocol === 'http:'
  const protocolMatches = !forwardedProto || parsed.protocol === `${forwardedProto}:`
  if (!host || parsed.host.toLowerCase() !== host || !protocolAllowed || !protocolMatches) {
    return { ok: false, status: 403, code: 'ORIGIN_NOT_ALLOWED', error: 'Origin is not allowed' }
  }
  return { ok: true }
}

export function enforceSameOriginJson(req, res) {
  const result = validateSameOriginJson(req)
  if (result.ok) return true
  res.status(result.status).json({ error: result.error, code: result.code })
  return false
}
