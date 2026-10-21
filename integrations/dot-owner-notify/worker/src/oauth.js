// ChatGPT（開発者モードのコネクタ）向けの最小限のOAuth 2.1。
// - 動的クライアント登録（DCR）＋ 認可コード + PKCE(S256) + refresh token（使うたびに入れ替え）
// - 認可画面では本人だけが知る「接続コード」（secret DOT_CONNECT_CODE）を入れて許可する
// - 接続コードを入れ替えると、それまでに発行した全トークンが無効になる（失効の手段）

import {
  SECURITY_HEADERS, escapeHtml, intVar, isoAfterSeconds, isoBeforeSeconds, json, nowIso,
  randomToken, readForm, secureEquals, sha256Base64url, sha256Hex,
} from './util.js'

export const OAUTH_SCOPE = 'notify'
const CODE_TTL_SECONDS = 300
const MAX_CLIENTS = 50
const MAX_REGISTRATIONS_PER_HOUR = 20
const MAX_CONNECT_CODE_FAILURES_PER_HOUR = 10
const PKCE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/

export function oauthEnabled(env) {
  return String(env.DOT_CONNECT_CODE || '').trim().length >= 24
}

export async function grantFingerprint(env) {
  return (await sha256Hex(`grant-fingerprint:${String(env.DOT_CONNECT_CODE || '').trim()}`)).slice(0, 32)
}

function allowedRedirectPrefixes(env) {
  return String(env.ALLOWED_REDIRECT_PREFIXES || 'https://chatgpt.com/,https://chat.openai.com/')
    .split(',').map((value) => value.trim()).filter(Boolean)
}

function redirectAllowed(env, uri) {
  let parsed
  try { parsed = new URL(uri) } catch { return false }
  if (parsed.hash || parsed.username || parsed.password) return false
  return allowedRedirectPrefixes(env).some((prefix) => uri.startsWith(prefix))
}

export function resourceUrl(origin) {
  return `${origin}/mcp`
}

function resourceAllowed(origin, resource) {
  if (!resource) return true
  const normalized = String(resource).replace(/\/+$/, '')
  return normalized === origin || normalized === resourceUrl(origin)
}

export function protectedResourceMetadata(origin) {
  return json({
    resource: resourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Aimo本人通知（dot用）',
  }, 200, { 'Access-Control-Allow-Origin': '*' })
}

export function authorizationServerMetadata(origin) {
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: [OAUTH_SCOPE],
    authorization_response_iss_parameter_supported: true,
  }, 200, { 'Access-Control-Allow-Origin': '*' })
}

function oauthError(error, description, status = 400, extraHeaders = {}) {
  return json({ error, error_description: description }, status, extraHeaders)
}

// ---------- 動的クライアント登録 ----------

export async function handleRegister(request, env) {
  if (!oauthEnabled(env)) return oauthError('temporarily_unavailable', 'connector is not configured', 503)
  const db = env.OWNER_NOTIFY_DB
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return oauthError('invalid_client_metadata', 'JSON object required')

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((uri) => typeof uri === 'string') : []
  if (redirectUris.length < 1 || redirectUris.length > 5 || redirectUris.length !== body.redirect_uris.length) {
    return oauthError('invalid_redirect_uri', 'redirect_uris must contain 1-5 URLs')
  }
  if (!redirectUris.every((uri) => uri.length <= 512 && redirectAllowed(env, uri))) {
    return oauthError('invalid_redirect_uri', 'redirect_uri is not allowed for this server')
  }
  const requestedMethod = body.token_endpoint_auth_method || 'none'
  if (!['none', 'client_secret_post', 'client_secret_basic'].includes(requestedMethod)) {
    return oauthError('invalid_client_metadata', 'unsupported token_endpoint_auth_method')
  }
  const grantTypes = body.grant_types || ['authorization_code', 'refresh_token']
  if (!Array.isArray(grantTypes) || grantTypes.some((type) => !['authorization_code', 'refresh_token'].includes(type))) {
    return oauthError('invalid_client_metadata', 'unsupported grant_types')
  }

  const total = await db.prepare('SELECT COUNT(*) AS count FROM oauth_clients').first()
  const recent = await db.prepare('SELECT COUNT(*) AS count FROM oauth_clients WHERE created_at >= ?')
    .bind(isoBeforeSeconds(3600)).first()
  if (Number(total?.count || 0) >= MAX_CLIENTS || Number(recent?.count || 0) >= MAX_REGISTRATIONS_PER_HOUR) {
    return oauthError('temporarily_unavailable', 'client registration limit reached', 429)
  }

  const clientId = `dotc_${randomToken(18)}`
  const clientSecret = requestedMethod === 'none' ? null : randomToken(32)
  const clientName = typeof body.client_name === 'string' ? body.client_name.slice(0, 100) : ''
  const createdAt = nowIso()
  await db.prepare(`INSERT INTO oauth_clients
      (client_id, client_secret_hash, client_name, redirect_uris, token_endpoint_auth_method, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(clientId, clientSecret ? await sha256Hex(clientSecret) : null, clientName,
      JSON.stringify(redirectUris), requestedMethod, createdAt)
    .run()

  const response = {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.parse(createdAt) / 1000),
    client_name: clientName || undefined,
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: requestedMethod,
    scope: OAUTH_SCOPE,
  }
  if (clientSecret) {
    response.client_secret = clientSecret
    response.client_secret_expires_at = 0
  }
  return json(response, 201)
}

async function loadClient(db, clientId) {
  if (typeof clientId !== 'string' || !/^dotc_[A-Za-z0-9_-]{10,64}$/.test(clientId)) return null
  const row = await db.prepare('SELECT * FROM oauth_clients WHERE client_id = ?').bind(clientId).first()
  if (!row) return null
  return { ...row, redirect_uris: JSON.parse(row.redirect_uris) }
}

// ---------- 認可画面 ----------

function authorizeParams(source) {
  const pick = (key) => (typeof source[key] === 'string' ? source[key] : '')
  return {
    response_type: pick('response_type'),
    client_id: pick('client_id'),
    redirect_uri: pick('redirect_uri'),
    code_challenge: pick('code_challenge'),
    code_challenge_method: pick('code_challenge_method'),
    state: pick('state').slice(0, 1024),
    scope: pick('scope').slice(0, 200),
    resource: pick('resource').slice(0, 512),
  }
}

function redirectWith(redirectUri, values) {
  const target = new URL(redirectUri)
  for (const [key, value] of Object.entries(values)) if (value) target.searchParams.set(key, value)
  return new Response(null, { status: 302, headers: { Location: target.toString(), ...SECURITY_HEADERS } })
}

function htmlPage(env, title, bodyHtml, status = 200) {
  const formTargets = allowedRedirectPrefixes(env).map((prefix) => {
    try { return new URL(prefix).origin } catch { return '' }
  }).filter(Boolean)
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `form-action 'self' ${formTargets.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; ')
  const page = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; }
body { font-family: -apple-system, "Hiragino Sans", sans-serif; max-width: 480px; margin: 40px auto; padding: 0 16px; line-height: 1.7; }
.box { border: 1px solid #8884; border-radius: 12px; padding: 20px; }
input[type=password] { width: 100%; box-sizing: border-box; padding: 10px; font-size: 16px; margin: 8px 0 16px; }
button { padding: 10px 18px; font-size: 15px; border-radius: 8px; border: 1px solid #8886; cursor: pointer; }
.primary { background: #06c755; color: #fff; border-color: #06c755; }
.error { color: #d33; font-weight: bold; }
.small { font-size: 13px; opacity: .75; }
ul { padding-left: 1.2em; }
</style></head><body>${bodyHtml}</body></html>`
  return new Response(page, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': csp,
      'X-Frame-Options': 'DENY',
      ...SECURITY_HEADERS,
    },
  })
}

function errorPage(env, message, status = 400) {
  return htmlPage(env, '接続できません', `<div class="box"><h1>接続できません</h1><p class="error">${escapeHtml(message)}</p></div>`, status)
}

// 画面を出す前・許可を確定する前の両方で同じ検証をする。
async function validateAuthorize(env, origin, params) {
  const client = await loadClient(env.OWNER_NOTIFY_DB, params.client_id)
  if (!client) return { page: errorPage(env, '登録されていないクライアントです。ChatGPT側で接続をやり直してください。') }
  if (!params.redirect_uri || !client.redirect_uris.includes(params.redirect_uri) || !redirectAllowed(env, params.redirect_uri)) {
    return { page: errorPage(env, '戻り先URLが登録内容と一致しません。') }
  }
  const fail = (error, description) => ({
    redirect: redirectWith(params.redirect_uri, { error, error_description: description, state: params.state, iss: origin }),
  })
  if (params.response_type !== 'code') return fail('unsupported_response_type', 'response_type must be code')
  if (params.code_challenge_method !== 'S256' || !PKCE_PATTERN.test(params.code_challenge)) {
    return fail('invalid_request', 'PKCE with S256 is required')
  }
  if (!resourceAllowed(origin, params.resource)) return fail('invalid_target', 'unknown resource')
  const scopes = params.scope.split(/\s+/).filter(Boolean)
  if (scopes.some((scope) => scope !== OAUTH_SCOPE)) return fail('invalid_scope', 'only notify scope is available')
  return { client }
}

function consentPage(env, client, params, errorMessage = '', status = 200) {
  const hidden = Object.entries(params)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`).join('')
  const redirectHost = new URL(params.redirect_uri).host
  const body = `<div class="box">
<h1>dotに本人通知の権限を与えますか？</h1>
<p>接続元: <strong>${escapeHtml(client.client_name || '名称なし')}</strong>（戻り先 ${escapeHtml(redirectHost)}）</p>
<p>許可すると、この接続は次のことだけができます。</p>
<ul>
<li>あなた本人のAimo公式LINEへ通知を送る（宛先は固定・変更不可）</li>
<li>通知の保存と読み戻し、送信状態の確認</li>
</ul>
${errorMessage ? `<p class="error">${escapeHtml(errorMessage)}</p>` : ''}
<form method="post" action="/oauth/authorize">
${hidden}
<label for="connect_code">接続コード（Macのキーチェーンに保存したもの）</label>
<input type="password" id="connect_code" name="connect_code" autocomplete="off" required>
<button class="primary" type="submit" name="decision" value="allow">許可する</button>
<button type="submit" name="decision" value="deny" formnovalidate>許可しない</button>
</form>
<p class="small">心当たりのない画面なら「許可しない」を押して閉じてください。</p>
</div>`
  return htmlPage(env, 'dotの接続許可', body, status)
}

export async function handleAuthorizeGet(request, env, origin) {
  if (!oauthEnabled(env)) return errorPage(env, 'この接続はまだ設定されていません。', 503)
  const params = authorizeParams(Object.fromEntries(new URL(request.url).searchParams))
  const checked = await validateAuthorize(env, origin, params)
  if (checked.page) return checked.page
  if (checked.redirect) return checked.redirect
  return consentPage(env, checked.client, params)
}

async function connectCodeLocked(db) {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM auth_failures WHERE kind = 'connect_code' AND at >= ?`)
    .bind(isoBeforeSeconds(3600)).first()
  return Number(row?.count || 0) >= MAX_CONNECT_CODE_FAILURES_PER_HOUR
}

export async function handleAuthorizePost(request, env, origin) {
  if (!oauthEnabled(env)) return errorPage(env, 'この接続はまだ設定されていません。', 503)
  const db = env.OWNER_NOTIFY_DB
  const form = await readForm(request)
  const params = authorizeParams(form)
  const checked = await validateAuthorize(env, origin, params)
  if (checked.page) return checked.page
  if (checked.redirect) return checked.redirect

  if (form.decision !== 'allow') {
    return redirectWith(params.redirect_uri, { error: 'access_denied', state: params.state, iss: origin })
  }
  if (await connectCodeLocked(db)) {
    return consentPage(env, checked.client, params, '失敗が続いたため1時間ロックしています。時間をおいてください。', 429)
  }
  if (!(await secureEquals(String(form.connect_code || '').trim(), String(env.DOT_CONNECT_CODE || '').trim()))) {
    await db.prepare(`INSERT INTO auth_failures (kind, at) VALUES ('connect_code', ?)`).bind(nowIso()).run()
    return consentPage(env, checked.client, params, '接続コードが違います。', 401)
  }

  const code = randomToken(32)
  await db.prepare(`INSERT INTO oauth_codes
      (code_hash, client_id, redirect_uri, code_challenge, scope, resource, grant_fingerprint, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(await sha256Hex(code), checked.client.client_id, params.redirect_uri, params.code_challenge, OAUTH_SCOPE,
      params.resource || null, await grantFingerprint(env), isoAfterSeconds(CODE_TTL_SECONDS), nowIso())
    .run()
  return redirectWith(params.redirect_uri, { code, state: params.state, iss: origin })
}

// ---------- トークン ----------

async function authenticateClient(request, env, form) {
  let clientId = typeof form.client_id === 'string' ? form.client_id : ''
  let clientSecret = typeof form.client_secret === 'string' ? form.client_secret : ''
  const header = request.headers.get('Authorization') || ''
  const basic = header.match(/^Basic\s+([A-Za-z0-9+/=]+)$/)
  if (basic) {
    try {
      const decoded = atob(basic[1])
      const separator = decoded.indexOf(':')
      if (separator > 0) {
        clientId = decodeURIComponent(decoded.slice(0, separator))
        clientSecret = decodeURIComponent(decoded.slice(separator + 1))
      }
    } catch { return null }
  }
  const client = await loadClient(env.OWNER_NOTIFY_DB, clientId)
  if (!client) return null
  if (client.client_secret_hash) {
    if (!clientSecret || !(await secureEquals(await sha256Hex(clientSecret), client.client_secret_hash))) return null
  }
  return client
}

async function issueTokens(env, clientId, familyId) {
  const db = env.OWNER_NOTIFY_DB
  const accessTtl = intVar(env.ACCESS_TOKEN_TTL_SEC, 3600, 300, 86400)
  const refreshTtl = intVar(env.REFRESH_TOKEN_TTL_SEC, 90 * 86400, 3600, 365 * 86400)
  const accessToken = `dota_${randomToken(32)}`
  const refreshToken = `dotr_${randomToken(32)}`
  const fingerprint = await grantFingerprint(env)
  const createdAt = nowIso()
  const insert = `INSERT INTO oauth_tokens
      (token_hash, kind, client_id, family_id, scope, grant_fingerprint, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  await db.batch([
    db.prepare(insert).bind(await sha256Hex(accessToken), 'access', clientId, familyId, OAUTH_SCOPE, fingerprint,
      isoAfterSeconds(accessTtl), createdAt),
    db.prepare(insert).bind(await sha256Hex(refreshToken), 'refresh', clientId, familyId, OAUTH_SCOPE, fingerprint,
      isoAfterSeconds(refreshTtl), createdAt),
  ])
  return json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: accessTtl,
    refresh_token: refreshToken,
    scope: OAUTH_SCOPE,
  }, 200, { Pragma: 'no-cache' })
}

export async function handleToken(request, env, origin) {
  if (!oauthEnabled(env)) return oauthError('temporarily_unavailable', 'connector is not configured', 503)
  const db = env.OWNER_NOTIFY_DB
  const form = await readForm(request)
  const client = await authenticateClient(request, env, form)
  if (!client) return oauthError('invalid_client', 'client authentication failed', 401)
  if (!resourceAllowed(origin, form.resource)) return oauthError('invalid_target', 'unknown resource')

  if (form.grant_type === 'authorization_code') {
    const code = typeof form.code === 'string' ? form.code : ''
    const verifier = typeof form.code_verifier === 'string' ? form.code_verifier : ''
    if (!code || !VERIFIER_PATTERN.test(verifier)) return oauthError('invalid_request', 'code and code_verifier are required')
    const codeHash = await sha256Hex(code)
    const row = await db.prepare('SELECT * FROM oauth_codes WHERE code_hash = ?').bind(codeHash).first()
    if (!row || row.client_id !== client.client_id || row.redirect_uri !== form.redirect_uri) {
      return oauthError('invalid_grant', 'authorization code is invalid')
    }
    if (row.used_at || row.expires_at <= nowIso() || row.grant_fingerprint !== await grantFingerprint(env)) {
      return oauthError('invalid_grant', 'authorization code is expired or already used')
    }
    if (await sha256Base64url(verifier) !== row.code_challenge) return oauthError('invalid_grant', 'PKCE verification failed')
    const used = await db.prepare('UPDATE oauth_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL')
      .bind(nowIso(), codeHash).run()
    if (used.meta?.changes !== 1) return oauthError('invalid_grant', 'authorization code already used')
    return issueTokens(env, client.client_id, randomToken(12))
  }

  if (form.grant_type === 'refresh_token') {
    const refreshToken = typeof form.refresh_token === 'string' ? form.refresh_token : ''
    if (!refreshToken.startsWith('dotr_')) return oauthError('invalid_grant', 'refresh token is invalid')
    const tokenHash = await sha256Hex(refreshToken)
    const row = await db.prepare(`SELECT * FROM oauth_tokens WHERE token_hash = ? AND kind = 'refresh'`).bind(tokenHash).first()
    if (!row || row.client_id !== client.client_id) return oauthError('invalid_grant', 'refresh token is invalid')
    if (row.revoked_at) {
      // 一度使ったrefresh tokenがまた来た＝漏えいの疑い。同じまとまりを全部止める。
      await db.prepare('UPDATE oauth_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL')
        .bind(nowIso(), row.family_id).run()
      return oauthError('invalid_grant', 'refresh token was already used')
    }
    if (row.expires_at <= nowIso() || row.grant_fingerprint !== await grantFingerprint(env)) {
      return oauthError('invalid_grant', 'refresh token is expired or revoked')
    }
    const rotated = await db.prepare('UPDATE oauth_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .bind(nowIso(), tokenHash).run()
    if (rotated.meta?.changes !== 1) return oauthError('invalid_grant', 'refresh token was already used')
    return issueTokens(env, client.client_id, row.family_id)
  }

  return oauthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token')
}

// MCPへのアクセストークンを確認する。戻り値: { ok, source, invalidToken }
export async function verifyAccessToken(env, token) {
  if (!token) return { ok: false, invalidToken: false }
  const staticToken = String(env.MCP_STATIC_TOKEN || '').trim()
  if (staticToken.length >= 24 && await secureEquals(token, staticToken)) return { ok: true, source: 'direct' }
  if (!oauthEnabled(env) || !token.startsWith('dota_')) return { ok: false, invalidToken: true }
  const row = await env.OWNER_NOTIFY_DB.prepare(`SELECT * FROM oauth_tokens WHERE token_hash = ? AND kind = 'access'`)
    .bind(await sha256Hex(token)).first()
  if (!row || row.revoked_at || row.expires_at <= nowIso() || row.grant_fingerprint !== await grantFingerprint(env)) {
    return { ok: false, invalidToken: true }
  }
  return { ok: true, source: 'dot' }
}

export function unauthorized(origin, invalidToken) {
  const parts = [
    `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
    `scope="${OAUTH_SCOPE}"`,
  ]
  if (invalidToken) parts.push('error="invalid_token"')
  return json({ error: invalidToken ? 'invalid_token' : 'unauthorized' }, 401, { 'WWW-Authenticate': parts.join(', ') })
}

// 古い認可コード・トークン・失敗記録の掃除（毎日のcronから呼ぶ）。
export async function cleanupOauth(env) {
  const db = env.OWNER_NOTIFY_DB
  await db.batch([
    db.prepare('DELETE FROM oauth_codes WHERE expires_at < ?').bind(isoBeforeSeconds(86400)),
    db.prepare('DELETE FROM oauth_tokens WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)')
      .bind(isoBeforeSeconds(7 * 86400), isoBeforeSeconds(7 * 86400)),
    db.prepare('DELETE FROM auth_failures WHERE at < ?').bind(isoBeforeSeconds(7 * 86400)),
    // 使われなくなった登録（有効なトークンが1つもないもの）は30日で消し、登録上限が埋まらないようにする。
    db.prepare(`DELETE FROM oauth_clients WHERE created_at < ? AND client_id NOT IN
        (SELECT client_id FROM oauth_tokens WHERE revoked_at IS NULL AND expires_at > ?)`)
      .bind(isoBeforeSeconds(30 * 86400), nowIso()),
  ])
}
