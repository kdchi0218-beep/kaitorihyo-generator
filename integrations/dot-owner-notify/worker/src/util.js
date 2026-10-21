// 共通の小道具：レスポンス、乱数、ハッシュ、時刻、入力の整形。
// 秘密情報（トークン・鍵・接続コード）はここを通ってもログには出さない。

const encoder = new TextEncoder()

export const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...extraHeaders },
  })
}

export function text(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS, ...extraHeaders },
  })
}

export function base64url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64url(bytes)
}

export async function sha256Bytes(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(value))))
}

export async function sha256Hex(value) {
  const bytes = await sha256Bytes(value)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256Base64url(value) {
  return base64url(await sha256Bytes(value))
}

// 長さが違っても時間で漏れない比較。両方を32バイトのハッシュにしてから比べる。
export async function secureEquals(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !provided || !expected) return false
  const [left, right] = await Promise.all([sha256Bytes(provided), sha256Bytes(expected)])
  let difference = 0
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index]
  return difference === 0
}

export function nowIso() {
  return new Date().toISOString()
}

export function isoAfterSeconds(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

export function isoBeforeSeconds(seconds) {
  return new Date(Date.now() - seconds * 1000).toISOString()
}

// 日本時間の今日0時をUTCのISO文字列で返す（1日の送信上限の数え始め）。
export function jstDayStartIso(date = new Date()) {
  const jstOffsetMs = 9 * 60 * 60 * 1000
  const jst = new Date(date.getTime() + jstOffsetMs)
  const startUtcMs = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - jstOffsetMs
  return new Date(startUtcMs).toISOString()
}

// 制御文字を落とす（改行とタブは残す）。LINEに送る本文とDB保存の両方で使う。
export function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
}

export function oneLine(value) {
  return cleanText(value).replace(/\s+/g, ' ')
}

export function intVar(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export function publicOrigin(request, env) {
  const configured = String(env.PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '')
  return configured || new URL(request.url).origin
}

export function bearerToken(request) {
  const header = request.headers.get('Authorization') || ''
  const match = header.match(/^Bearer\s+([A-Za-z0-9._~+\/=-]{16,512})$/)
  return match ? match[1] : ''
}

export async function readForm(request) {
  const type = (request.headers.get('Content-Type') || '').toLowerCase()
  if (type.startsWith('application/json')) {
    const body = await request.json().catch(() => null)
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  }
  const form = await request.formData().catch(() => null)
  const result = {}
  if (form) for (const [key, value] of form.entries()) if (typeof value === 'string') result[key] = value
  return result
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char])
}
