// Vercel Serverless Function: Google SheetsのCSV取得プロキシ。
// URL、リダイレクト先、応答形式、取得時間、容量をすべて制限する。

const MAX_CSV_BYTES = 20 * 1024 * 1024
const SHEET_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3
const SHEET_PATH_PATTERN = /^\/spreadsheets\/d\/[a-zA-Z0-9_-]+\/gviz\/tq\/?$/
const CSV_CONTENT_TYPES = new Set([
  'application/csv',
  'application/octet-stream',
  'text/csv',
  'text/plain',
])

class SheetProxyError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.name = 'SheetProxyError'
    this.statusCode = statusCode
  }
}

function parseHttpsUrl(rawUrl) {
  let parsed
  try { parsed = new URL(rawUrl) } catch { throw new SheetProxyError('invalid url', 400) }
  if (parsed.protocol !== 'https:') throw new SheetProxyError('https required', 400)
  if (parsed.port && parsed.port !== '443') throw new SheetProxyError('port not allowed', 403)
  if (parsed.username || parsed.password) throw new SheetProxyError('credentials not allowed', 400)
  return parsed
}

export function parseSheetCsvUrl(rawUrl) {
  const parsed = parseHttpsUrl(rawUrl)
  if (parsed.hostname !== 'docs.google.com') throw new SheetProxyError('domain not allowed', 403)
  if (!SHEET_PATH_PATTERN.test(parsed.pathname)) throw new SheetProxyError('sheet path not allowed', 403)
  if (parsed.searchParams.get('tqx') !== 'out:csv') throw new SheetProxyError('csv export required', 400)
  const gid = parsed.searchParams.get('gid')
  if (gid !== null && !/^\d+$/.test(gid)) throw new SheetProxyError('invalid gid', 400)
  return parsed
}

function parseRedirectUrl(location, baseUrl) {
  let resolved
  try { resolved = new URL(location, baseUrl) } catch { throw new SheetProxyError('invalid redirect', 502) }
  const parsed = parseHttpsUrl(resolved.toString())
  const allowed = parsed.hostname === 'docs.google.com' || parsed.hostname.endsWith('.googleusercontent.com')
  if (!allowed) throw new SheetProxyError('redirect target not allowed', 403)
  return parsed
}

async function readBodyWithLimit(response, maxBytes) {
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new SheetProxyError('csv too large', 413)
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function fetchSheetCsv(rawUrl, {
  fetchImpl = fetch,
  maxBytes = MAX_CSV_BYTES,
  signal = AbortSignal.timeout(SHEET_TIMEOUT_MS),
} = {}) {
  let currentUrl = parseSheetCsvUrl(rawUrl)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const upstream = await fetchImpl(currentUrl.toString(), {
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': 'TontonKaitoriGenerator/1.0' },
    })

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location')
      if (!location || hop === MAX_REDIRECTS) throw new SheetProxyError('upstream redirect not allowed', 502)
      currentUrl = parseRedirectUrl(location, currentUrl)
      continue
    }

    if (!upstream.ok) throw new SheetProxyError('upstream request failed', upstream.status)

    const contentType = (upstream.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase()
    if (!CSV_CONTENT_TYPES.has(contentType)) throw new SheetProxyError('content type not allowed', 415)

    const declaredLength = Number(upstream.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new SheetProxyError('csv too large', 413)
    }

    const body = await readBodyWithLimit(upstream, maxBytes)
    return new TextDecoder().decode(body)
  }

  throw new SheetProxyError('upstream redirect not allowed', 502)
}

// GET /api/sheet?u=<encodeURIComponentしたCSVエクスポートURL>
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).send('GET only'); return }
  const url = req.query?.u
  if (!url) { res.status(400).send('u (csv url) required'); return }

  try {
    const csv = await fetchSheetCsv(url)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.status(200).send(csv)
  } catch (error) {
    if (error instanceof SheetProxyError) {
      res.status(error.statusCode).send(error.message)
      return
    }
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      res.status(504).send('upstream timeout')
      return
    }
    console.error('Sheet proxy error:', error?.message || 'unknown')
    res.status(500).send('proxy error')
  }
}
