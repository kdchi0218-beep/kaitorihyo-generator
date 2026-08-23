import {
  BrowserSessionError,
  authenticateBoundRequest,
  serviceRequest,
  supabaseUserRequest,
} from './_lib/browser-session.js'

const MAX_ASSET_BYTES = 10 * 1024 * 1024
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const ASSET_PATH = new RegExp(`^(${UUID})/(${UUID})\\.(avif|gif|jpe?g|png|webp)$`, 'i')
const IMAGE_TYPES = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'])

class AssetError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.statusCode = statusCode
  }
}

export function normalizeAssetPath(value) {
  const path = String(value || '').trim()
  const match = path.match(ASSET_PATH)
  if (!match) throw new AssetError('asset path is invalid', 400)
  return { path, storeId: match[1].toLowerCase() }
}

async function readLimited(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new AssetError('asset too large', 413)
      chunks.push(Buffer.from(value))
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }
  return Buffer.concat(chunks, total)
}

export async function fetchBoundAsset(auth, rawPath, {
  userRequest = supabaseUserRequest,
  storageRequest = serviceRequest,
  maxBytes = MAX_ASSET_BYTES,
} = {}) {
  const { path, storeId } = normalizeAssetPath(rawPath)
  const access = await userRequest(
    auth,
    `/rest/v1/stores?select=id&id=eq.${encodeURIComponent(storeId)}&limit=1`,
  )
  if (!access.ok) throw new AssetError('store access could not be verified', 502)
  const stores = await access.json().catch(() => [])
  if (!Array.isArray(stores) || stores.length === 0) throw new AssetError('asset is not available', 403)

  const upstream = await storageRequest(`/storage/v1/object/store-assets/${path}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })
  if (upstream.status >= 300 && upstream.status < 400) throw new AssetError('storage redirect is not allowed', 502)
  if (!upstream.ok) throw new AssetError('asset was not found', upstream.status === 404 ? 404 : 502)

  const contentType = String(upstream.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase()
  if (!IMAGE_TYPES.has(contentType)) throw new AssetError('asset content type is not allowed', 415)
  const length = Number(upstream.headers.get('content-length'))
  if (Number.isFinite(length) && length > maxBytes) throw new AssetError('asset too large', 413)
  return { bytes: await readLimited(upstream, maxBytes), contentType }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.status(405).send('GET only'); return }
  const fetchSite = String(req.headers?.['sec-fetch-site'] || '').toLowerCase()
  if (fetchSite && fetchSite !== 'same-origin') { res.status(403).send('same-origin only'); return }
  try {
    const auth = await authenticateBoundRequest(req, res)
    const asset = await fetchBoundAsset(auth, req.query?.path)
    res.setHeader('Content-Type', asset.contentType)
    res.setHeader('Content-Length', String(asset.bytes.length))
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.status(200).send(asset.bytes)
  } catch (error) {
    const status = error instanceof BrowserSessionError ? error.status : (error?.statusCode || 500)
    if (status >= 500) console.error('Asset API error:', error?.message || 'unknown')
    res.status(status).send(status >= 500 ? 'asset error' : error.message)
  }
}
