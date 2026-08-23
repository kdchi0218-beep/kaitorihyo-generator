// Vercel Serverless Function: 外部画像の中継（買取表出力時のCORS対策の保険）
// 許可ドメイン・HTTPS・画像MIME・容量をすべて制限する。

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_TIMEOUT_MS = 10_000
const ALLOWED_IMAGE_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

class ImageProxyError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.name = 'ImageProxyError'
    this.statusCode = statusCode
  }
}

function isAllowedHost(host) {
  return host.endsWith('.supabase.co') ||
    host.endsWith('.cardrush.media') ||
    host === 'files.cardrush.media' ||
    host === 'www.cardrush-pokemon.jp' ||
    host === 'www.cardrush-op.jp' ||
    host.endsWith('.googleusercontent.com') ||
    host === 'firebasestorage.googleapis.com' ||
    host === 'storage.googleapis.com'
}

export function parseAllowedImageUrl(rawUrl) {
  let parsed
  try { parsed = new URL(rawUrl) } catch { throw new ImageProxyError('invalid url', 400) }
  if (parsed.protocol !== 'https:') throw new ImageProxyError('https required', 400)
  if (parsed.port && parsed.port !== '443') throw new ImageProxyError('port not allowed', 403)
  if (parsed.username || parsed.password) throw new ImageProxyError('credentials not allowed', 400)
  if (!isAllowedHost(parsed.hostname)) throw new ImageProxyError('domain not allowed', 403)
  return parsed
}

async function readBodyWithLimit(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new ImageProxyError('image too large', 413)
      chunks.push(Buffer.from(value))
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }
  return Buffer.concat(chunks, total)
}

export async function fetchImageAsset(rawUrl, {
  fetchImpl = fetch,
  maxBytes = MAX_IMAGE_BYTES,
  signal = AbortSignal.timeout(IMAGE_TIMEOUT_MS),
} = {}) {
  const parsed = parseAllowedImageUrl(rawUrl)
  const upstream = await fetchImpl(parsed.toString(), {
    redirect: 'manual',
    signal,
    headers: { 'User-Agent': 'TontonKaitoriGenerator/1.0' },
  })

  if (upstream.status >= 300 && upstream.status < 400) {
    throw new ImageProxyError('upstream redirect not allowed', 502)
  }
  if (!upstream.ok) throw new ImageProxyError(`upstream ${upstream.status}`, upstream.status)

  const contentType = (upstream.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase()
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw new ImageProxyError('content type not allowed', 415)

  const declaredLength = Number(upstream.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ImageProxyError('image too large', 413)
  }

  return {
    body: await readBodyWithLimit(upstream, maxBytes),
    contentType,
  }
}

// GET /api/image-proxy?url=<encodeURIComponentした画像URL>
export default async function handler(req, res) {
  const url = req.query?.url
  if (!url) { res.status(400).send('url required'); return }

  try {
    const asset = await fetchImageAsset(url)
    res.setHeader('Content-Type', asset.contentType)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.status(200).send(asset.body)
  } catch (error) {
    if (error instanceof ImageProxyError) {
      res.status(error.statusCode).send(error.message)
      return
    }
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      res.status(504).send('upstream timeout')
      return
    }
    console.error('Image proxy error:', error?.message || 'unknown')
    res.status(500).send('proxy error')
  }
}
