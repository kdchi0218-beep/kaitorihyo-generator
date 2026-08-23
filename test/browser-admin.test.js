import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createBrowserUsersHandler,
  mergeBrowserUsers,
  normalizeBrowserResetRequest,
} from '../api/admin/browser-users.js'
import { createBrowserAdminApi } from '../src/lib/browserAdmin.js'

test('browser admin: 解除対象UUIDと理由を検証する', () => {
  assert.deepEqual(normalizeBrowserResetRequest({
    userId: '81efc564-45cf-4f31-b33f-7d25e36d033a',
    reason: ' PCを入れ替えたため ',
  }), {
    userId: '81efc564-45cf-4f31-b33f-7d25e36d033a',
    reason: 'PCを入れ替えたため',
  })
  assert.throws(() => normalizeBrowserResetRequest({ userId: 'not-uuid', reason: '機種変' }), /ユーザー/)
  assert.throws(() => normalizeBrowserResetRequest({
    userId: '81efc564-45cf-4f31-b33f-7d25e36d033a',
    reason: '',
  }), /理由/)
})

test('browser admin: Authユーザーへ店舗名と固定状態を安全に結合する', () => {
  const rows = mergeBrowserUsers({
    users: [
      { id: 'u1', email: 'admin@example.com' },
      { id: 'u2', email: 'staff@example.com' },
    ],
    admins: [{ user_id: 'u1' }],
    members: [{ user_id: 'u2', store_id: 's1' }],
    stores: [{ id: 's1', name: '名古屋店' }],
    bindings: [{ user_id: 'u2', bound_at: '2026-08-23T00:00:00Z', last_seen_at: '2026-08-23T01:00:00Z' }],
  })

  assert.deepEqual(rows, [
    {
      id: 'u1', email: 'admin@example.com', isAdmin: true, stores: [],
      browser: { bound: false, boundAt: null, lastSeenAt: null },
    },
    {
      id: 'u2', email: 'staff@example.com', isAdmin: false, stores: ['名古屋店'],
      browser: { bound: true, boundAt: '2026-08-23T00:00:00Z', lastSeenAt: '2026-08-23T01:00:00Z' },
    },
  ])
})

test('browser admin client: Cookie認証で一覧取得と理由付き解除を行う', async () => {
  const calls = []
  const browserAdmin = createBrowserAdminApi(async (url, init = {}) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(url.includes('browser-users') && init.method === 'GET'
      ? { users: [{ id: 'u1', email: 'staff@example.com' }] }
      : { ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  assert.equal((await browserAdmin.list()).length, 1)
  await browserAdmin.reset('81efc564-45cf-4f31-b33f-7d25e36d033a', 'PC交換')
  assert.deepEqual(calls.map(call => [call.init.method, call.init.credentials]), [
    ['GET', 'same-origin'],
    ['POST', 'same-origin'],
  ])
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    userId: '81efc564-45cf-4f31-b33f-7d25e36d033a',
    reason: 'PC交換',
  })
})

test('browser admin API: 解除を1回のPATCHで行い、DBトリガーへ監査記録を委ねる', async () => {
  const targetUserId = '81efc564-45cf-4f31-b33f-7d25e36d033a'
  const actorUserId = 'a1efc564-45cf-4f31-b33f-7d25e36d033a'
  const bindingId = 'b1efc564-45cf-4f31-b33f-7d25e36d033a'
  const calls = []
  const handler = createBrowserUsersHandler({
    authenticateBoundRequest: async () => ({ user: { id: actorUserId } }),
    requireAdmin: async () => true,
    serviceRequest: async (path, init = {}) => {
      calls.push({ path, init })
      if (path.includes('select=id&user_id=')) {
        return new Response(JSON.stringify([{ id: bindingId }]), { status: 200 })
      }
      if (path.startsWith('/rest/v1/browser_bindings?id=')) {
        return new Response(JSON.stringify([{ id: bindingId }]), { status: 200 })
      }
      throw new Error(`unexpected path: ${path}`)
    },
  })
  const response = { statusCode: null, body: null, headers: {} }
  const res = {
    setHeader: (name, value) => { response.headers[name] = value },
    status: code => ({
      json: body => { response.statusCode = code; response.body = body },
    }),
  }

  await handler({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://tonton.example',
      host: 'tonton.example',
    },
    body: { userId: targetUserId, reason: 'PC交換' },
  }, res)

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.body, { ok: true })
  assert.equal(calls.length, 2)
  const revokeBody = JSON.parse(calls.at(-1).init.body)
  assert.equal(revokeBody.revoked_by, actorUserId)
  assert.equal(revokeBody.revocation_reason, 'PC交換')
})

test('browser admin API: 管理者は自分自身のブラウザ固定を解除できない', async () => {
  const actorUserId = 'a1efc564-45cf-4f31-b33f-7d25e36d033a'
  let serviceCalled = false
  const handler = createBrowserUsersHandler({
    authenticateBoundRequest: async () => ({ user: { id: actorUserId } }),
    requireAdmin: async () => true,
    serviceRequest: async () => {
      serviceCalled = true
      throw new Error('serviceRequest must not be called')
    },
  })
  const response = { statusCode: null, body: null }
  const res = {
    setHeader: () => {},
    status: code => ({
      json: body => { response.statusCode = code; response.body = body },
    }),
  }

  await handler({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://tonton.example',
      host: 'tonton.example',
    },
    body: { userId: actorUserId, reason: '自分のPC交換' },
  }, res)

  assert.equal(response.statusCode, 409)
  assert.match(response.body.error, /別の管理者/)
  assert.equal(serviceCalled, false)
})
