// 業務データ用 BFF。ブラウザは Supabase のJWTや端末秘密値を保持しない。
import {
  authenticateBoundRequest,
  supabaseUserRequest,
  serviceRequest,
  requireAdmin,
} from './_lib/browser-session.js'
import { enforceSameOriginJson } from './_lib/request-security.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const IMAGE_TYPES = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'])
const IMAGE_EXTENSIONS = new Map([
  ['image/avif', new Set(['avif'])],
  ['image/gif', new Set(['gif'])],
  ['image/jpeg', new Set(['jpg', 'jpeg'])],
  ['image/png', new Set(['png'])],
  ['image/webp', new Set(['webp'])],
])
const MAX_ASSET_BYTES = 10 * 1024 * 1024
const MAX_JSON_BYTES = 1024 * 1024
const ACTIONS = new Set([
  'check_admin', 'list_my_stores', 'list_all_stores',
  'load_settings', 'save_settings',
  'create_store', 'add_member', 'delete_store',
  'list_templates', 'create_template', 'update_template', 'delete_template', 'rename_template',
  'list_card_lists', 'create_card_list', 'copy_card_list', 'save_card_list', 'delete_card_list',
  'create_asset_upload',
])

function invalid(message) {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

function requiredUuid(value, label) {
  const id = String(value || '').trim()
  if (!UUID_PATTERN.test(id)) throw invalid(`${label} must be a UUID`)
  return id
}

function requiredName(value, label = 'name', maxLength = 120) {
  const name = String(value || '').trim()
  if (!name || name.length > maxLength) throw invalid(`${label} must be 1-${maxLength} characters`)
  return name
}

function optionalGenre(value) {
  if (value === undefined || value === null || value === '') return ''
  const genre = String(value).trim()
  if (!genre || genre.length > 40) throw invalid('genre must be 1-40 characters')
  return genre
}

function jsonBytes(value) {
  let encoded
  try { encoded = JSON.stringify(value) } catch { return null }
  if (!encoded) return null
  return Buffer.byteLength(encoded, 'utf8')
}

function assertJson(value, label) {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid(`${label} must be a JSON object`)
  }
  const bytes = jsonBytes(value)
  if (bytes === null) throw invalid(`${label} must be JSON serializable`)
  if (bytes > MAX_JSON_BYTES) throw invalid(`${label} is too large`)
  return value
}

function assertItems(value) {
  if (!Array.isArray(value)) throw invalid('items must be an array')
  const bytes = jsonBytes(value)
  if (bytes === null) throw invalid('items must be JSON serializable')
  if (bytes > MAX_JSON_BYTES) throw invalid('items is too large')
  return value
}

function safeFilename(value) {
  const filename = String(value || '').trim()
  if (!filename || filename.length > 120 || /[\\/\0]/.test(filename)) throw invalid('filename is invalid')
  const ext = filename.split('.').pop()?.toLowerCase()
  if (!ext || !/^[a-z0-9]{1,8}$/.test(ext)) throw invalid('filename is invalid')
  return { filename, ext }
}

/** POST /api/data の入力を、各アクションで必要な最小形に絞る。 */
export function normalizeDataRequest(input = {}) {
  const action = String(input.action || '')
  if (!ACTIONS.has(action)) throw invalid('invalid action')
  const out = { action }

  if (['load_settings', 'save_settings', 'add_member', 'create_template', 'create_card_list', 'copy_card_list', 'create_asset_upload'].includes(action)) {
    out.storeId = requiredUuid(input.storeId, 'storeId')
  }
  if (['update_template', 'delete_template', 'rename_template', 'save_card_list', 'delete_card_list'].includes(action)) {
    out.id = requiredUuid(input.id, 'id')
  }
  if (action === 'delete_store') out.storeId = requiredUuid(input.storeId, 'storeId')
  if (action === 'create_store') out.name = requiredName(input.name, 'name', 100)
  if (action === 'add_member') out.userId = requiredUuid(input.userId, 'userId')
  if (['list_templates', 'list_card_lists'].includes(action)) {
    out.storeId = requiredUuid(input.storeId, 'storeId')
    out.genre = optionalGenre(input.genre)
    if (action === 'list_card_lists' && !out.genre) throw invalid('genre must be 1-40 characters')
  }
  if (['create_template', 'create_card_list', 'copy_card_list'].includes(action)) {
    out.genre = optionalGenre(input.genre)
    if (!out.genre) throw invalid('genre must be 1-40 characters')
    out.name = requiredName(input.name)
  }
  if (action === 'create_template') out.settings = assertJson(input.settings, 'settings')
  if (action === 'save_settings') out.settings = assertJson(input.settings, 'settings')
  if (action === 'update_template') {
    out.name = requiredName(input.name)
    out.settings = assertJson(input.settings, 'settings')
  }
  if (action === 'rename_template') out.name = requiredName(input.name)
  if (action === 'copy_card_list' || action === 'save_card_list') out.items = assertItems(input.items)
  if (action === 'create_asset_upload') {
    const file = safeFilename(input.filename)
    out.filename = file.filename
    out.ext = file.ext
    out.contentType = String(input.contentType || '').toLowerCase()
    if (!IMAGE_TYPES.has(out.contentType)) throw invalid('contentType is not allowed')
    if (!IMAGE_EXTENSIONS.get(out.contentType)?.has(out.ext)) throw invalid('filename extension does not match contentType')
    out.size = Number(input.size)
    if (!Number.isSafeInteger(out.size) || out.size <= 0 || out.size > MAX_ASSET_BYTES) throw invalid('size is invalid')
  }
  return out
}

async function readJson(response, fallback) {
  const raw = await response.text()
  let body = fallback
  try { body = raw ? JSON.parse(raw) : fallback } catch { /* non-JSON upstream error */ }
  if (!response.ok) {
    const error = new Error(body?.message || body?.error || 'Supabase request failed')
    error.statusCode = response.status >= 400 && response.status < 500 ? response.status : 502
    throw error
  }
  return body
}

/**
 * このBFFからSupabase Data APIへ送る文字列bodyはJSONだけ。
 * Content-Type未指定だとfetchがtext/plainを補うため、PostgREST向けに明示する。
 */
export function withJsonContentType(init = {}) {
  if (typeof init.body !== 'string') return init
  const headers = init.headers || {}
  if (headers instanceof Headers) {
    if (headers.has('Content-Type')) return init
    const nextHeaders = new Headers(headers)
    nextHeaders.set('Content-Type', 'application/json')
    return { ...init, headers: nextHeaders }
  }
  const alreadySet = Object.keys(headers).some(name => name.toLowerCase() === 'content-type')
  if (alreadySet) return init
  return { ...init, headers: { ...headers, 'Content-Type': 'application/json' } }
}

async function userJson(auth, path, init) {
  return readJson(await supabaseUserRequest(auth, path, withJsonContentType(init)), [])
}

async function isAdmin(auth) {
  const rows = await userJson(auth, `/rest/v1/app_admins?select=user_id&user_id=eq.${encodeURIComponent(auth.user.id)}&limit=1`)
  return Array.isArray(rows) && rows.length > 0
}

async function myStores(auth) {
  if (await isAdmin(auth)) {
    return userJson(auth, '/rest/v1/stores?select=id,name&order=name.asc')
  }
  const rows = await userJson(auth, `/rest/v1/store_members?select=store:stores(id,name)&user_id=eq.${encodeURIComponent(auth.user.id)}`)
  return rows.map(row => row.store).filter(Boolean)
}

async function assertStoreAccess(auth, storeId) {
  const stores = await myStores(auth)
  if (!stores.some(store => store.id === storeId)) {
    const error = new Error('この店舗へのアクセス権限がありません')
    error.statusCode = 403
    throw error
  }
}

export function buildAssetProxyUrl(path) {
  return `/api/asset?path=${encodeURIComponent(path)}`
}

async function signedUpload(auth, payload) {
  await assertStoreAccess(auth, payload.storeId)
  const path = `${payload.storeId}/${crypto.randomUUID()}.${payload.ext}`
  const response = await serviceRequest(`/storage/v1/object/upload/sign/store-assets/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const signed = await readJson(response, {})
  const baseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  if (!signed?.url || !baseUrl) throw new Error('signed upload URL could not be created')
  const signedUrl = signed.url.startsWith('http') ? signed.url : `${baseUrl}/storage/v1${signed.url}`
  return {
    path,
    signedUrl,
    assetUrl: buildAssetProxyUrl(path),
    token: signed.token || null,
  }
}

async function dispatch(auth, request) {
  const now = new Date().toISOString()
  switch (request.action) {
    case 'check_admin': return { isAdmin: await isAdmin(auth) }
    case 'list_my_stores': return myStores(auth)
    case 'list_all_stores': return userJson(auth, '/rest/v1/stores?select=id,name&order=name.asc')
    case 'load_settings': {
      const rows = await userJson(auth, `/rest/v1/store_settings?select=settings,updated_at&store_id=eq.${request.storeId}&order=updated_at.desc&limit=1`)
      return rows[0]?.settings || null
    }
    case 'save_settings':
      return userJson(auth, '/rest/v1/store_settings?on_conflict=store_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ store_id: request.storeId, settings: request.settings, updated_at: now }),
      })
    case 'create_store': {
      await requireAdmin(auth)
      const rows = await userJson(auth, '/rest/v1/stores', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name: request.name }),
      })
      return rows[0]
    }
    case 'add_member':
      await requireAdmin(auth)
      return userJson(auth, '/rest/v1/store_members?on_conflict=store_id,user_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ store_id: request.storeId, user_id: request.userId }),
      })
    case 'delete_store':
      await requireAdmin(auth)
      return userJson(auth, `/rest/v1/stores?id=eq.${request.storeId}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
    case 'list_templates': {
      const genre = request.genre ? `&genre=eq.${encodeURIComponent(request.genre)}` : ''
      return userJson(auth, `/rest/v1/templates?select=id,name,settings,updated_at&store_id=eq.${request.storeId}${genre}&order=updated_at.desc`)
    }
    case 'create_template': {
      const rows = await userJson(auth, '/rest/v1/templates', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ store_id: request.storeId, genre: request.genre, name: request.name, settings: request.settings }),
      })
      return rows[0]
    }
    case 'update_template':
      return userJson(auth, `/rest/v1/templates?id=eq.${request.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name: request.name, settings: request.settings, updated_at: now }),
      })
    case 'delete_template':
      return userJson(auth, `/rest/v1/templates?id=eq.${request.id}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
    case 'rename_template':
      return userJson(auth, `/rest/v1/templates?id=eq.${request.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name: request.name, updated_at: now }),
      })
    case 'list_card_lists':
      return userJson(auth, `/rest/v1/card_lists?select=id,name,items,updated_at&store_id=eq.${request.storeId}&genre=eq.${encodeURIComponent(request.genre)}&order=name.asc`)
    case 'create_card_list': {
      const rows = await userJson(auth, '/rest/v1/card_lists', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ store_id: request.storeId, genre: request.genre, name: request.name, items: [] }),
      })
      return rows[0]
    }
    case 'copy_card_list':
      return userJson(auth, '/rest/v1/card_lists', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ store_id: request.storeId, genre: request.genre, name: request.name, items: request.items }),
      })
    case 'save_card_list':
      return userJson(auth, `/rest/v1/card_lists?id=eq.${request.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ items: request.items, updated_at: now }),
      })
    case 'delete_card_list':
      return userJson(auth, `/rest/v1/card_lists?id=eq.${request.id}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
    case 'create_asset_upload': return signedUpload(auth, request)
    default: throw invalid('invalid action')
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'POST only' }); return }
  if (!enforceSameOriginJson(req, res)) return
  try {
    const auth = await authenticateBoundRequest(req, res)
    const request = normalizeDataRequest(req.body || {})
    const data = await dispatch(auth, request)
    res.status(200).json({ data })
  } catch (error) {
    const status = error?.statusCode || 500
    if (status >= 500) console.error('Data API error:', error?.message || 'unknown')
    res.status(status).json({
      error: status >= 500 ? 'サーバーエラーが発生しました' : error.message,
      ...(error?.code ? { code: error.code } : {}),
    })
  }
}
