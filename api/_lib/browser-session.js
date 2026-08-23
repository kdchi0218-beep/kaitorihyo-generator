import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

const SESSION_COOKIE = '__Host-tonton-session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7
const DEVICE_MAX_AGE = 60 * 60 * 24 * 365
const LAST_SEEN_INTERVAL_MS = 15 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class BrowserSessionError extends Error {
  constructor(status, code) {
    super(code)
    this.status = status
    this.statusCode = status
    this.code = code
  }
}

function configured(name) {
  const value = process.env[name]
  if (!value) throw new BrowserSessionError(500, 'SERVER_NOT_CONFIGURED')
  return value
}

function supabaseUrl() {
  const value = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  if (!value) throw new BrowserSessionError(500, 'SERVER_NOT_CONFIGURED')
  return value
}

function publishableKey() {
  return configured('VITE_SUPABASE_PUBLISHABLE_KEY')
}

function secretKey() {
  return configured('SUPABASE_SECRET_KEY')
}

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

function fromBase64url(value) {
  try { return Buffer.from(value, 'base64url') } catch { return null }
}

function constantEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && timingSafeEqual(a, b)
}

export function readCookies(req) {
  const raw = String(req?.headers?.cookie || '')
  return raw.split(';').reduce((cookies, part) => {
    const index = part.indexOf('=')
    if (index < 1) return cookies
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    try { cookies[name] = decodeURIComponent(value) } catch { /* Ignore malformed cookie values. */ }
    return cookies
  }, {})
}

export function serializeHostCookie(name, value, { maxAge = SESSION_MAX_AGE, expires } = {}) {
  if (!name.startsWith('__Host-')) throw new Error('Host cookie name required')
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict']
  if (Number.isFinite(maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`)
  if (expires instanceof Date) parts.push(`Expires=${expires.toUTCString()}`)
  return parts.join('; ')
}

export function appendCookie(res, cookie) {
  const current = res.getHeader?.('Set-Cookie')
  const values = current ? (Array.isArray(current) ? current : [current]) : []
  res.setHeader('Set-Cookie', [...values, cookie])
}

export function clearHostCookie(res, name) {
  appendCookie(res, serializeHostCookie(name, '', { maxAge: 0, expires: new Date(0) }))
}

export function deviceCookieName(userId) {
  if (!UUID_PATTERN.test(String(userId || ''))) throw new Error('Invalid user id')
  return `__Host-tonton-device-${String(userId).toLowerCase()}`
}

export function createBrowserBinding() {
  const deviceSecret = randomBytes(32).toString('base64url')
  return {
    deviceId: randomUUID(),
    deviceSecret,
    secretHash: createHash('sha256').update(deviceSecret, 'utf8').digest('hex'),
  }
}

export function encodeSessionCookie({ accessToken, refreshToken }) {
  if (!accessToken || !refreshToken) throw new Error('Session tokens required')
  return base64url(JSON.stringify({ a: accessToken, r: refreshToken }))
}

export function decodeSessionCookie(value) {
  const decoded = fromBase64url(value)
  if (!decoded) return null
  try {
    const parsed = JSON.parse(decoded.toString('utf8'))
    if (!parsed?.a || !parsed?.r || typeof parsed.a !== 'string' || typeof parsed.r !== 'string') return null
    return { accessToken: parsed.a, refreshToken: parsed.r }
  } catch { return null }
}

function setSession(res, session) {
  appendCookie(res, serializeHostCookie(SESSION_COOKIE, encodeSessionCookie(session), { maxAge: SESSION_MAX_AGE }))
}

function setDevice(res, userId, binding) {
  const value = `${binding.deviceId}.${binding.deviceSecret}`
  appendCookie(res, serializeHostCookie(deviceCookieName(userId), value, { maxAge: DEVICE_MAX_AGE }))
}

function parseDeviceCookie(value) {
  const [deviceId, deviceSecret, ...rest] = String(value || '').split('.')
  if (rest.length || !UUID_PATTERN.test(deviceId || '') || !/^[A-Za-z0-9_-]{43}$/.test(deviceSecret || '')) return null
  return { deviceId: deviceId.toLowerCase(), deviceSecret }
}

async function request(path, init = {}, key = publishableKey()) {
  const headers = {
    apikey: key,
    ...(init.headers || {}),
  }
  return fetch(`${supabaseUrl()}${path}`, { ...init, headers })
}

export async function serviceRequest(path, init = {}) {
  const key = secretKey()
  return request(path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...(init.headers || {}) },
  }, key)
}

export async function supabaseUserRequest(auth, path, init = {}) {
  if (!auth?.accessToken || !auth?.deviceId || !auth?.deviceSecret) throw new BrowserSessionError(401, 'UNAUTHENTICATED')
  return request(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'x-browser-device-id': auth.deviceId,
      'x-browser-device-secret': auth.deviceSecret,
      ...(init.headers || {}),
    },
  })
}

async function currentUser(accessToken) {
  const response = await request('/auth/v1/user', { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) return null
  const user = await response.json()
  return UUID_PATTERN.test(String(user?.id || '')) ? user : null
}

async function refreshSession(refreshToken) {
  const response = await request('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!response.ok) return null
  const session = await response.json()
  if (!session?.access_token || !session?.refresh_token) return null
  return { accessToken: session.access_token, refreshToken: session.refresh_token }
}

async function activeBindingFor(userId) {
  const response = await serviceRequest(`/rest/v1/browser_bindings?select=id,secret_hash,last_seen_at&user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null&limit=1`)
  if (!response.ok) throw new BrowserSessionError(502, 'BINDING_LOOKUP_FAILED')
  const rows = await response.json()
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

export function shouldTouchBinding(lastSeenAt, now = Date.now()) {
  const lastSeen = Date.parse(String(lastSeenAt || ''))
  return !Number.isFinite(lastSeen) || now - lastSeen >= LAST_SEEN_INTERVAL_MS
}

async function touchBinding(binding) {
  if (!binding?.id || !shouldTouchBinding(binding.last_seen_at)) return
  const cutoff = new Date(Date.now() - LAST_SEEN_INTERVAL_MS).toISOString()
  try {
    await serviceRequest(
      `/rest/v1/browser_bindings?id=eq.${encodeURIComponent(binding.id)}&revoked_at=is.null&last_seen_at=lt.${encodeURIComponent(cutoff)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
      },
    )
  } catch {
    // Last-seen is operational metadata and must not break a valid session.
  }
}

async function ensureBoundDevice(req, res, user, { allowCreate = false } = {}) {
  const cookie = parseDeviceCookie(readCookies(req)[deviceCookieName(user.id)])
  const active = await activeBindingFor(user.id)

  if (active) {
    const actualHash = cookie ? createHash('sha256').update(cookie.deviceSecret, 'utf8').digest('hex') : ''
    if (!cookie || String(active.id).toLowerCase() !== cookie.deviceId || !constantEqual(active.secret_hash, actualHash)) {
      throw new BrowserSessionError(423, 'BROWSER_LOCKED')
    }
    await touchBinding(active)
    return cookie
  }

  // Session refresh must never silently claim a new browser after an admin
  // reset. Only an explicit password login can register the replacement.
  if (!allowCreate) throw new BrowserSessionError(423, 'BROWSER_LOCKED')

  const binding = createBrowserBinding()
  const inserted = await serviceRequest('/rest/v1/browser_bindings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ id: binding.deviceId, user_id: user.id, secret_hash: binding.secretHash }),
  })
  if (!inserted.ok) {
    // A parallel first login may have won the partial unique constraint.
    const nowActive = await activeBindingFor(user.id)
    if (nowActive) throw new BrowserSessionError(423, 'BROWSER_LOCKED')
    throw new BrowserSessionError(502, 'BINDING_CREATE_FAILED')
  }
  setDevice(res, user.id, binding)
  return binding
}

export async function loginBoundBrowser(req, res, { email, password }) {
  const response = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw new BrowserSessionError(401, 'INVALID_CREDENTIALS')
  const session = await response.json()
  if (!session?.access_token || !session?.refresh_token || !UUID_PATTERN.test(String(session?.user?.id || ''))) {
    throw new BrowserSessionError(502, 'AUTH_RESPONSE_INVALID')
  }
  const device = await ensureBoundDevice(req, res, session.user, { allowCreate: true })
  setSession(res, { accessToken: session.access_token, refreshToken: session.refresh_token })
  return { user: session.user, deviceId: device.deviceId }
}

export async function authenticateBoundRequest(req, res) {
  const session = decodeSessionCookie(readCookies(req)[SESSION_COOKIE])
  if (!session) throw new BrowserSessionError(401, 'UNAUTHENTICATED')
  let accessToken = session.accessToken
  let refreshToken = session.refreshToken
  let user = await currentUser(accessToken)
  if (!user) {
    const refreshed = await refreshSession(refreshToken)
    if (!refreshed) {
      clearHostCookie(res, SESSION_COOKIE)
      throw new BrowserSessionError(401, 'UNAUTHENTICATED')
    }
    accessToken = refreshed.accessToken
    refreshToken = refreshed.refreshToken
    user = await currentUser(accessToken)
    if (!user) {
      clearHostCookie(res, SESSION_COOKIE)
      throw new BrowserSessionError(401, 'UNAUTHENTICATED')
    }
    setSession(res, { accessToken, refreshToken })
  }
  const device = await ensureBoundDevice(req, res, user)
  return { user, accessToken, deviceId: device.deviceId, deviceSecret: device.deviceSecret }
}

export async function requireAdmin(auth) {
  const response = await serviceRequest(`/rest/v1/app_admins?select=user_id&user_id=eq.${encodeURIComponent(auth?.user?.id || '')}&limit=1`)
  if (!response.ok) throw new BrowserSessionError(502, 'ADMIN_LOOKUP_FAILED')
  const rows = await response.json()
  if (!Array.isArray(rows) || rows.length === 0) throw new BrowserSessionError(403, 'ADMIN_REQUIRED')
  return true
}

export function clearSessionCookie(res) {
  clearHostCookie(res, SESSION_COOKIE)
}

export async function logoutBoundBrowser(req, res) {
  const session = decodeSessionCookie(readCookies(req)[SESSION_COOKIE])
  clearSessionCookie(res)
  if (!session?.accessToken) return
  try {
    await request('/auth/v1/logout?scope=local', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
  } catch {
    // Cookie deletion is the guaranteed local logout. A transient upstream
    // failure must not leave the browser looking signed in.
  }
}
