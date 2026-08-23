import test from 'node:test'
import assert from 'node:assert/strict'

import { createAuthApi } from '../src/lib/authApi.js'

test('auth client: JWTを保持せずCookie付きBFFへログインする', async () => {
  const calls = []
  const auth = createAuthApi(async (url, init = {}) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ user: { id: 'u1', email: 'staff@example.com' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  const result = await auth.login(' Staff@Example.COM ', 'safe-password-123')

  assert.deepEqual(result, { user: { id: 'u1', email: 'staff@example.com' } })
  assert.equal(calls[0].url, '/api/auth/login')
  assert.equal(calls[0].init.credentials, 'same-origin')
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    email: 'staff@example.com',
    password: 'safe-password-123',
  })
})

test('auth client: ブラウザ固定エラーを利用者向けメッセージとして保持する', async () => {
  const auth = createAuthApi(async () => new Response(JSON.stringify({
    code: 'BROWSER_LOCKED',
    error: 'このアカウントは別のブラウザに固定されています',
  }), {
    status: 423,
    headers: { 'Content-Type': 'application/json' },
  }))

  await assert.rejects(
    () => auth.login('staff@example.com', 'safe-password-123'),
    error => error.code === 'BROWSER_LOCKED' && error.status === 423,
  )
})

test('auth client: sessionとlogoutもCookie付きで呼び、トークンを返さない', async () => {
  const calls = []
  const auth = createAuthApi(async (url, init = {}) => {
    calls.push({ url, init })
    if (url.endsWith('/session')) {
      return new Response(JSON.stringify({ user: { id: 'u1', email: 'staff@example.com' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  assert.deepEqual(await auth.getSession(), { user: { id: 'u1', email: 'staff@example.com' } })
  await auth.logout()
  assert.deepEqual(calls.map(call => [call.url, call.init.method, call.init.credentials]), [
    ['/api/auth/session', 'GET', 'same-origin'],
    ['/api/auth/logout', 'POST', 'same-origin'],
  ])
})
