// dot → 本人のAimo公式LINE ＋ KAI COCKPIT 用の通知中継（Cloudflare Worker）。
// Mac・Claude Code・コックピットが止まっていても、dot からの通知の保存とLINE送信はここで完結する。
//
//   POST /mcp                         … dot（ChatGPTコネクタ）用のMCP。OAuthのアクセストークン必須
//   /.well-known/*, /oauth/*          … ChatGPTコネクタ用のOAuth
//   GET  /api/notifications           … KAI COCKPIT 起動時の取得用（読み取り専用トークン）
//   GET  /api/notifications/:id
//   GET  /api/status
//   GET  /health                      … 生存確認（情報は返さない）

import { gasConfigured, gasOwnerStatus } from './gas.js'
import { handleMcp } from './mcp.js'
import { InputError, getNotification, listNotifications, relaySummary } from './notify.js'
import {
  authorizationServerMetadata, cleanupOauth, handleAuthorizeGet, handleAuthorizePost, handleRegister, handleToken,
  oauthEnabled, protectedResourceMetadata, unauthorized, verifyAccessToken,
} from './oauth.js'
import { bearerToken, json, publicOrigin, secureEquals, text } from './util.js'

async function cockpitAuthorized(request, env) {
  const expected = String(env.COCKPIT_READ_TOKEN || '').trim()
  return expected.length >= 24 && secureEquals(bearerToken(request), expected)
}

async function handleCockpit(request, env, url) {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' })
  if (!(await cockpitAuthorized(request, env))) return json({ error: 'unauthorized' }, 401)
  try {
    if (url.pathname === '/api/notifications') {
      const result = await listNotifications(env, {
        limit: url.searchParams.get('limit') || 200,
        updatedSince: url.searchParams.get('since'),
        status: url.searchParams.get('status'),
      })
      return json({ server_time: new Date().toISOString(), ...result })
    }
    const single = url.pathname.match(/^\/api\/notifications\/([^/]{1,300})$/)
    if (single) {
      let id = ''
      try { id = decodeURIComponent(single[1]) } catch { /* 形式チェックで弾く */ }
      const notification = await getNotification(env, id)
      return notification ? json({ notification }) : json({ error: 'not_found' }, 404)
    }
    if (url.pathname === '/api/status') {
      const status = {
        server_time: new Date().toISOString(),
        relay: { gas_configured: gasConfigured(env), oauth_enabled: oauthEnabled(env) },
        ...(await relaySummary(env)),
      }
      if (url.searchParams.get('check_gas') === '1') {
        status.gas_owner_only = gasConfigured(env) ? await gasOwnerStatus(env) : { reachable: false, error: 'relay_not_configured' }
      }
      return json(status)
    }
    return json({ error: 'not_found' }, 404)
  } catch (error) {
    if (error instanceof InputError) return json({ error: error.code, message: error.message }, 400)
    throw error
  }
}

async function route(request, env) {
  const url = new URL(request.url)
  const origin = publicOrigin(request, env)
  const path = url.pathname

  if (path === '/health' || path === '/') return text('ok')

  if (path.startsWith('/.well-known/oauth-protected-resource')) return protectedResourceMetadata(origin)
  if (path.startsWith('/.well-known/oauth-authorization-server') || path.startsWith('/.well-known/openid-configuration')) {
    return authorizationServerMetadata(origin)
  }
  if (path === '/oauth/register' && request.method === 'POST') return handleRegister(request, env)
  if (path === '/oauth/authorize' && request.method === 'GET') return handleAuthorizeGet(request, env, origin)
  if (path === '/oauth/authorize' && request.method === 'POST') return handleAuthorizePost(request, env, origin)
  if (path === '/oauth/token' && request.method === 'POST') return handleToken(request, env, origin)

  if (path === '/mcp') {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' })
    const auth = await verifyAccessToken(env, bearerToken(request))
    if (!auth.ok) return unauthorized(origin, auth.invalidToken)
    return handleMcp(request, env, auth)
  }

  if (path.startsWith('/api/')) return handleCockpit(request, env, url)
  return json({ error: 'not_found' }, 404)
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env)
    } catch (error) {
      // 本文やトークンはログに出さない。エラーの種類だけ残す。
      console.error('unhandled_error', error && error.message)
      return json({ error: 'internal_error' }, 500)
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanupOauth(env))
  },
}
