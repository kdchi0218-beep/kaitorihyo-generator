import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  createBrowserBinding,
  decodeSessionCookie,
  deviceCookieName,
  encodeSessionCookie,
  loginBoundBrowser,
  logoutBoundBrowser,
  readCookies,
  serializeHostCookie,
  shouldTouchBinding,
} from '../api/_lib/browser-session.js'

test('browser session: セッションcookieはHttpOnly/Secure/SameSite=Strictかつ__Host制約を満たす', () => {
  const cookie = serializeHostCookie('__Host-tonton-session', 'opaque-value', { maxAge: 60 })
  assert.match(cookie, /^__Host-tonton-session=opaque-value;/)
  assert.match(cookie, /Path=\//)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Secure/)
  assert.match(cookie, /SameSite=Strict/)
  assert.doesNotMatch(cookie, /Domain=/)
})

test('browser session: JWT/refresh tokenは応答JSONではなくHttpOnly cookie用の復元可能な値としてだけ扱う', () => {
  const encoded = encodeSessionCookie({ accessToken: 'access.jwt', refreshToken: 'refresh.token' })
  assert.doesNotMatch(encoded, /access\.jwt|refresh\.token/)
  assert.deepEqual(decodeSessionCookie(encoded), {
    accessToken: 'access.jwt',
    refreshToken: 'refresh.token',
  })
  assert.equal(decodeSessionCookie('tampered'), null)
})

test('browser session: ユーザーごとに異なるdevice cookieを使い、32 byte secretは平文をDB保存しない形式で生成する', () => {
  const userId = '81efc564-45cf-4f31-b33f-7d25e36d033a'
  const binding = createBrowserBinding()
  assert.match(binding.deviceId, /^[0-9a-f-]{36}$/i)
  assert.match(binding.deviceSecret, /^[A-Za-z0-9_-]{43}$/)
  assert.match(binding.secretHash, /^[a-f0-9]{64}$/)
  assert.equal(deviceCookieName(userId), `__Host-tonton-device-${userId}`)
})

test('browser session: cookie parserは複数ユーザーのdevice cookieを独立して保持する', () => {
  const cookies = readCookies({ headers: { cookie: 'a=1; __Host-tonton-device-a=first; __Host-tonton-device-b=second' } })
  assert.equal(cookies['__Host-tonton-device-a'], 'first')
  assert.equal(cookies['__Host-tonton-device-b'], 'second')
})

test('browser session: 最終利用時刻は15分以上経過した時だけ更新する', () => {
  const now = Date.parse('2026-08-23T12:00:00Z')
  assert.equal(shouldTouchBinding('2026-08-23T11:44:59Z', now), true)
  assert.equal(shouldTouchBinding('2026-08-23T11:50:00Z', now), false)
  assert.equal(shouldTouchBinding(null, now), true)
})

test('browser session: ログアウト時はSupabase sessionを失効して認証cookieだけを消す', async () => {
  const oldFetch = globalThis.fetch
  const oldUrl = process.env.SUPABASE_URL
  const oldKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const calls = []
  process.env.SUPABASE_URL = 'https://project.supabase.co'
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(null, { status: 204 })
  }
  const encoded = encodeSessionCookie({ accessToken: 'access.jwt', refreshToken: 'refresh.token' })
  const headers = {}
  const res = {
    getHeader: name => headers[name],
    setHeader: (name, value) => { headers[name] = value },
  }
  try {
    await logoutBoundBrowser({ headers: { cookie: `__Host-tonton-session=${encoded}` } }, res)
    assert.equal(calls[0].url, 'https://project.supabase.co/auth/v1/logout?scope=local')
    assert.equal(calls[0].init.headers.Authorization, 'Bearer access.jwt')
    assert.match(headers['Set-Cookie'][0], /__Host-tonton-session=;/)
    assert.match(headers['Set-Cookie'][0], /Max-Age=0/)
  } finally {
    globalThis.fetch = oldFetch
    if (oldUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    else process.env.VITE_SUPABASE_PUBLISHABLE_KEY = oldKey
  }
})

test('browser session: 初回だけ固定し、同じブラウザは再ログイン可・別ブラウザは423', async () => {
  const oldFetch = globalThis.fetch
  const oldUrl = process.env.SUPABASE_URL
  const oldKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const oldSecret = process.env.SUPABASE_SECRET_KEY
  process.env.SUPABASE_URL = 'https://project.supabase.co'
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'
  const user = { id: '81efc564-45cf-4f31-b33f-7d25e36d033a', email: 'staff@example.com' }
  let activeBinding = null
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url)
    if (value.endsWith('/auth/v1/token?grant_type=password')) {
      return new Response(JSON.stringify({
        access_token: 'access.jwt', refresh_token: 'refresh.token', user,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (value.includes('/rest/v1/browser_bindings?select=')) {
      return new Response(JSON.stringify(activeBinding ? [activeBinding] : []), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    if (value.endsWith('/rest/v1/browser_bindings') && init.method === 'POST') {
      const body = JSON.parse(init.body)
      activeBinding = {
        id: body.id,
        secret_hash: body.secret_hash,
        last_seen_at: new Date().toISOString(),
      }
      return new Response(null, { status: 201 })
    }
    throw new Error(`unexpected request: ${value}`)
  }

  const makeRes = () => {
    const headers = {}
    return {
      headers,
      getHeader: name => headers[name],
      setHeader: (name, value) => { headers[name] = value },
    }
  }

  try {
    const firstRes = makeRes()
    const first = await loginBoundBrowser({ headers: {} }, firstRes, {
      email: user.email, password: 'safe-password-123',
    })
    assert.equal(first.user.id, user.id)
    assert.equal('accessToken' in first, false)
    const deviceSetCookie = firstRes.headers['Set-Cookie'].find(value => value.startsWith(deviceCookieName(user.id)))
    const devicePair = deviceSetCookie.split(';', 1)[0]
    const deviceValue = decodeURIComponent(devicePair.slice(devicePair.indexOf('=') + 1))
    const [, deviceSecret] = deviceValue.split('.')
    assert.equal(activeBinding.secret_hash, createHash('sha256').update(deviceSecret).digest('hex'))

    const sameRes = makeRes()
    await loginBoundBrowser({ headers: { cookie: devicePair } }, sameRes, {
      email: user.email, password: 'safe-password-123',
    })
    assert.ok(sameRes.headers['Set-Cookie'].some(value => value.startsWith('__Host-tonton-session=')))

    await assert.rejects(
      () => loginBoundBrowser({ headers: {} }, makeRes(), {
        email: user.email, password: 'safe-password-123',
      }),
      error => error.code === 'BROWSER_LOCKED' && error.status === 423,
    )
  } finally {
    globalThis.fetch = oldFetch
    if (oldUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    else process.env.VITE_SUPABASE_PUBLISHABLE_KEY = oldKey
    if (oldSecret === undefined) delete process.env.SUPABASE_SECRET_KEY
    else process.env.SUPABASE_SECRET_KEY = oldSecret
  }
})
