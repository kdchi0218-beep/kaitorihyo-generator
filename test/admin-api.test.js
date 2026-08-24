import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { normalizeAccountRequest, provisionStoreUser } from '../api/admin/create-user.js'
import { createBrowserUsersHandler } from '../api/admin/browser-users.js'
import { createUserInStore } from '../src/lib/storeSync.js'
import { createBrowserAdminApi } from '../src/lib/browserAdmin.js'
import * as accountPassword from '../src/lib/accountPassword.js'

const storeId = '81efc564-45cf-4f31-b33f-7d25e36d033a'
const targetUserId = '91efc564-45cf-4f31-b33f-7d25e36d033a'
const actorUserId = 'a1efc564-45cf-4f31-b33f-7d25e36d033a'

function deleteAccountRequest(
  userId = targetUserId,
  headers = {},
  email = 'staff@example.com',
  reason = '退職のため',
) {
  return {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      origin: 'https://tonton.example',
      host: 'tonton.example',
      ...headers,
    },
    body: { userId, email, reason },
  }
}

function jsonRecorder() {
  const result = { statusCode: null, body: null, headers: {} }
  return {
    result,
    res: {
      setHeader(name, value) { result.headers[name] = value },
      status(code) {
        return { json(body) { result.statusCode = code; result.body = body } }
      },
    },
  }
}

function deletionHandler({ serviceRequest, requireAdmin = async () => true } = {}) {
  return createBrowserUsersHandler({
    authenticateBoundRequest: async () => ({ user: { id: actorUserId } }),
    requireAdmin,
    serviceRequest: serviceRequest || (async () => { throw new Error('unexpected upstream request') }),
  })
}

test('admin API: 8文字以上・UTF-8で72バイト以下のパスワードだけを受け付ける', () => {
  assert.deepEqual(normalizeAccountRequest({
    email: ' Staff@Example.COM ',
    password: 'Abcd1234',
    storeId,
  }), {
    email: 'staff@example.com',
    password: 'Abcd1234',
    storeId,
  })
  assert.throws(() => normalizeAccountRequest({
    email: 'staff@example.com',
    password: 'Abcd123',
    storeId,
  }), /8文字以上/)
  assert.doesNotThrow(() => normalizeAccountRequest({
    email: 'staff@example.com',
    password: 'A'.repeat(72),
    storeId,
  }))
  assert.throws(() => normalizeAccountRequest({
    email: 'staff@example.com',
    password: 'A'.repeat(73),
    storeId,
  }), /72バイト以下/)
  assert.doesNotThrow(() => normalizeAccountRequest({
    email: 'staff@example.com',
    password: 'あ'.repeat(24),
    storeId,
  }))
  assert.throws(() => normalizeAccountRequest({
    email: 'staff@example.com',
    password: 'あ'.repeat(25),
    storeId,
  }), /72バイト以下/)
  assert.throws(() => normalizeAccountRequest({
    email: 'invalid',
    invite: true,
    storeId,
  }), /メール/)
})

test('admin client: 境界外のパスワードはAPIへ送らずに拒否する', async (t) => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (...args) => {
    calls.push(args)
    return new Response(JSON.stringify({ ok: true, userId: '91efc564-45cf-4f31-b33f-7d25e36d033a' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  t.after(() => { globalThis.fetch = originalFetch })

  await createUserInStore({ email: 'staff@example.com', password: 'Abcd1234', storeId })
  assert.equal(calls.length, 1)

  await assert.rejects(
    () => createUserInStore({ email: 'staff@example.com', password: 'Abcd123', storeId }),
    /8文字以上/,
  )
  assert.equal(calls.length, 1, '7文字のパスワードをサーバーへ送信しない')

  await assert.rejects(
    () => createUserInStore({ email: 'staff@example.com', password: 'A'.repeat(73), storeId }),
    /72バイト以下/,
  )
  assert.equal(calls.length, 1, '73バイトのパスワードをサーバーへ送信しない')
})

test('管理画面: パスワード入力の最小文字数と案内を8文字に統一する', async () => {
  const source = await readFile(new URL('../src/components/AdminPanel.jsx', import.meta.url), 'utf8')

  assert.match(source, /minLength=\{8\}/)
  assert.match(source, /maxLength=\{72\}/)
  assert.match(source, /パスワードは8文字以上/)
  assert.match(source, /72バイト以下/)
  assert.doesNotMatch(source, /パスワードは12文字以上|12〜128文字|128文字以下/)
})

test('管理画面: 自動生成パスワードは16文字で全ての推奨文字種を含む', () => {
  assert.equal(typeof accountPassword.generateAccountPassword, 'function')
  const password = accountPassword.generateAccountPassword()

  assert.equal([...password].length, 16)
  assert.match(password, /[A-Z]/)
  assert.match(password, /[a-z]/)
  assert.match(password, /[0-9]/)
  assert.match(password, /[-_.!]/)
})

test('admin API: 未実装の招待方式を受け付けず、必ず初期パスワードを要求する', () => {
  assert.throws(() => normalizeAccountRequest({
    email: 'staff@example.com',
    storeId,
    invite: true,
  }), /パスワード/)
})

test('admin API: Supabaseのパスワード要件エラーをコードで判定する', async () => {
  const request = async () => new Response(JSON.stringify({
    code: 'weak_password',
    message: 'Password should be at least 10 characters.',
  }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })

  await assert.rejects(() => provisionStoreUser({
    email: 'staff@example.com',
    password: 'Abcd1234',
    storeId,
  }, request), error => {
    assert.doesNotMatch(error.message, /登録済み/)
    assert.match(error.message, /認証サービスのパスワード要件/)
    return true
  })
})

test('admin API: Supabaseの登録済みメールエラーは従来どおり案内する', async () => {
  const request = async () => new Response(JSON.stringify({
    code: 'email_exists',
  }), {
    status: 422,
    headers: { 'Content-Type': 'application/json' },
  })

  await assert.rejects(() => provisionStoreUser({
    email: 'staff@example.com',
    password: 'Abcd1234',
    storeId,
  }, request), /このメールは登録済み/)
})

test('admin API: Supabase旧形式のerror_codeを数値codeより優先する', async () => {
  const responses = [
    {
      body: { code: 422, error_code: 'weak_password', msg: 'Credential rejected' },
      expected: /認証サービスのパスワード要件/,
    },
    {
      body: { code: 422, error_code: 'email_exists', msg: 'Conflict' },
      expected: /このメールは登録済み/,
    },
  ]

  for (const { body, expected } of responses) {
    const request = async () => new Response(JSON.stringify(body), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    })
    await assert.rejects(() => provisionStoreUser({
      email: 'staff@example.com',
      password: 'Abcd1234',
      storeId,
    }, request), expected)
  }
})

test('admin API: その他の入力エラーを登録済みメールやパスワード要件と誤表示しない', async () => {
  const request = async () => new Response(JSON.stringify({
    code: 'email_address_invalid',
    message: 'User does not exist',
  }), {
    status: 422,
    headers: { 'Content-Type': 'application/json' },
  })

  await assert.rejects(() => provisionStoreUser({
    email: 'staff@example.com',
    password: 'Abcd1234',
    storeId,
  }, request), error => {
    assert.doesNotMatch(error.message, /登録済み|パスワード要件/)
    assert.match(error.message, /入力内容/)
    return true
  })
})

test('admin API: 店舗紐付け失敗時は作成したAuthユーザーを巻き戻す', async () => {
  const userId = '91efc564-45cf-4f31-b33f-7d25e36d033a'
  const calls = []
  const request = async (path, init = {}) => {
    calls.push({ path, init })
    if (calls.length === 1) {
      return new Response(JSON.stringify({ id: userId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (calls.length === 2) return new Response('member insert failed', { status: 500 })
    if (calls.length === 3) return new Response(null, { status: 204 })
    throw new Error('unexpected request')
  }

  await assert.rejects(() => provisionStoreUser({
    email: 'staff@example.com',
    password: 'long-password-123',
    storeId,
  }, request), /店舗メンバー/)

  assert.equal(calls.length, 3)
  assert.equal(calls[2].path, `/auth/v1/admin/users/${userId}`)
  assert.equal(calls[2].init.method, 'DELETE')
})

test('admin client: Cookie認証とJSONで店舗アカウント削除を依頼する', async () => {
  const calls = []
  const adminApi = createBrowserAdminApi(async (url, init = {}) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ ok: true, userId: targetUserId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  const result = await adminApi.remove(targetUserId, 'staff@example.com', '退職のため')

  assert.deepEqual(result, { ok: true, userId: targetUserId })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/admin/browser-users')
  assert.equal(calls[0].init.method, 'DELETE')
  assert.equal(calls[0].init.credentials, 'same-origin')
  assert.equal(calls[0].init.cache, 'no-store')
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    userId: targetUserId,
    email: 'staff@example.com',
    reason: '退職のため',
  })
})

test('admin API: 削除対象のUUIDが不正な場合は上流へ送らない', async () => {
  let upstreamCalled = false
  const handler = deletionHandler({
    serviceRequest: async () => {
      upstreamCalled = true
      throw new Error('upstream must not be called')
    },
  })
  const { result, res } = jsonRecorder()

  await handler(deleteAccountRequest('not-a-uuid'), res)

  assert.equal(result.statusCode, 400)
  assert.match(result.body.error, /対象ユーザー/)
  assert.equal(upstreamCalled, false)
})

test('admin API: 対象メールと削除理由を検証してから上流へ送る', async () => {
  for (const request of [
    deleteAccountRequest(targetUserId, {}, 'invalid', '退職のため'),
    deleteAccountRequest(targetUserId, {}, 'staff@example.com', ''),
    deleteAccountRequest(targetUserId, {}, 'staff@example.com', 'a'.repeat(201)),
  ]) {
    let upstreamCalled = false
    const handler = deletionHandler({
      serviceRequest: async () => {
        upstreamCalled = true
        throw new Error('upstream must not be called')
      },
    })
    const { result, res } = jsonRecorder()

    await handler(request, res)

    assert.equal(result.statusCode, 400)
    assert.equal(upstreamCalled, false)
  }
})

test('admin API: 管理者以外は店舗アカウントを削除できない', async () => {
  let upstreamCalled = false
  const handler = deletionHandler({
    requireAdmin: async () => {
      throw Object.assign(new Error('管理者のみ実行できます'), { status: 403, code: 'ADMIN_REQUIRED' })
    },
    serviceRequest: async () => {
      upstreamCalled = true
      throw new Error('upstream must not be called')
    },
  })
  const { result, res } = jsonRecorder()

  await handler(deleteAccountRequest(), res)

  assert.equal(result.statusCode, 403)
  assert.equal(result.body.code, 'ADMIN_REQUIRED')
  assert.equal(upstreamCalled, false)
})

test('admin API: 管理者は自分自身のアカウントを削除できない', async () => {
  let upstreamCalled = false
  const handler = deletionHandler({
    serviceRequest: async () => {
      upstreamCalled = true
      throw new Error('upstream must not be called')
    },
  })
  const { result, res } = jsonRecorder()

  await handler(deleteAccountRequest(actorUserId), res)

  assert.equal(result.statusCode, 409)
  assert.match(result.body.error, /自身.*削除できません/)
  assert.equal(upstreamCalled, false)
})

test('admin API: 自分以外でも管理者アカウントは削除できない', async () => {
  const calls = []
  const handler = deletionHandler({
    serviceRequest: async (path, init = {}) => {
      calls.push({ path, init })
      if (path.startsWith('/rest/v1/app_admins?')) {
        return new Response(JSON.stringify([{ user_id: targetUserId }]), { status: 200 })
      }
      throw new Error(`unexpected path: ${path}`)
    },
  })
  const { result, res } = jsonRecorder()

  await handler(deleteAccountRequest(), res)

  assert.equal(result.statusCode, 409)
  assert.match(result.body.error, /管理者アカウント.*削除できません/)
  assert.equal(calls.length, 1, '管理者判定後は所属確認やAuth削除を行わない')
})

test('admin API: 店舗所属がない対象は404としAuth削除しない', async () => {
  const calls = []
  const handler = deletionHandler({
    serviceRequest: async (path, init = {}) => {
      calls.push({ path, init })
      if (path.startsWith('/rest/v1/app_admins?')) return new Response('[]', { status: 200 })
      if (path.startsWith('/rest/v1/store_members?')) return new Response('[]', { status: 200 })
      throw new Error(`unexpected path: ${path}`)
    },
  })
  const { result, res } = jsonRecorder()

  await handler(deleteAccountRequest(), res)

  assert.equal(result.statusCode, 404)
  assert.match(result.body.error, /店舗アカウント.*見つかりません/)
  assert.equal(calls.some(call => call.path.startsWith('/auth/v1/admin/users/')), false)
})

test('admin API: 店舗所属の一般アカウントだけをAuthから削除する', async () => {
  const calls = []
  const handler = deletionHandler({
    serviceRequest: async (path, init = {}) => {
      calls.push({ path, init })
      if (path.startsWith('/rest/v1/app_admins?')) return new Response('[]', { status: 200 })
      if (path.startsWith('/rest/v1/store_members?')) {
        return new Response(JSON.stringify([{ user_id: targetUserId }]), { status: 200 })
      }
      if (path === `/auth/v1/admin/users/${targetUserId}` && !init.method) {
        return new Response(JSON.stringify({ id: targetUserId, email: 'staff@example.com' }), { status: 200 })
      }
      if (path === `/auth/v1/admin/users/${targetUserId}` && init.method === 'DELETE') {
        return new Response(JSON.stringify({ id: targetUserId }), { status: 200 })
      }
      throw new Error(`unexpected path: ${path}`)
    },
  })
  const { result, res } = jsonRecorder()

  await handler(deleteAccountRequest(), res)

  assert.equal(result.statusCode, 200)
  assert.deepEqual(result.body, { ok: true, userId: targetUserId })
  assert.equal(result.headers['Cache-Control'], 'private, no-store')
  const authDelete = calls.filter(call => call.path.startsWith('/auth/v1/admin/users/'))
  assert.equal(authDelete.length, 2)
  assert.equal(authDelete[0].init.method, undefined)
  assert.equal(authDelete[1].init.method, 'DELETE')
})

test('admin API: 画面表示後に対象メールが変わった場合は削除しない', async () => {
  const calls = []
  const handler = deletionHandler({
    serviceRequest: async (path, init = {}) => {
      calls.push({ path, init })
      if (path.startsWith('/rest/v1/app_admins?')) return new Response('[]', { status: 200 })
      if (path.startsWith('/rest/v1/store_members?')) {
        return new Response(JSON.stringify([{ user_id: targetUserId }]), { status: 200 })
      }
      if (path === `/auth/v1/admin/users/${targetUserId}` && !init.method) {
        return new Response(JSON.stringify({ id: targetUserId, email: 'renamed@example.com' }), { status: 200 })
      }
      throw new Error(`unexpected path: ${path}`)
    },
  })
  const { result, res } = jsonRecorder()

  await handler(deleteAccountRequest(), res)

  assert.equal(result.statusCode, 409)
  assert.match(result.body.error, /再読込/)
  assert.equal(calls.some(call => call.init.method === 'DELETE'), false)
})

test('admin API: 対象確認の上流失敗は安全な502としAuth削除しない', async () => {
  const calls = []
  const handler = deletionHandler({
    serviceRequest: async (path, init = {}) => {
      calls.push({ path, init })
      if (path.startsWith('/rest/v1/app_admins?')) return new Response('[]', { status: 200 })
      if (path.startsWith('/rest/v1/store_members?')) return new Response('lookup failed', { status: 500 })
      throw new Error(`unexpected path: ${path}`)
    },
  })
  const { result, res } = jsonRecorder()

  await handler(deleteAccountRequest(), res)

  assert.equal(result.statusCode, 502)
  assert.match(result.body.error, /対象アカウントを確認できません/)
  assert.equal(calls.some(call => call.path.startsWith('/auth/v1/admin/users/')), false)
})

test('admin API: Auth削除の上流失敗は安全な502で応答する', async () => {
  const handler = deletionHandler({
    serviceRequest: async (path, init = {}) => {
      if (path.startsWith('/rest/v1/app_admins?')) return new Response('[]', { status: 200 })
      if (path.startsWith('/rest/v1/store_members?')) {
        return new Response(JSON.stringify([{ user_id: targetUserId }]), { status: 200 })
      }
      if (path === `/auth/v1/admin/users/${targetUserId}` && !init.method) {
        return new Response(JSON.stringify({ id: targetUserId, email: 'staff@example.com' }), { status: 200 })
      }
      if (path.startsWith('/auth/v1/admin/users/') && init.method === 'DELETE') {
        return new Response('delete failed', { status: 500 })
      }
      throw new Error(`unexpected path: ${path}`)
    },
  })
  const { result, res } = jsonRecorder()

  await handler(deleteAccountRequest(), res)

  assert.equal(result.statusCode, 502)
  assert.match(result.body.error, /アカウントを削除できません/)
})

test('admin API: 保存画像の所有権でAuth削除できない場合は明示的な409にする', async () => {
  const handler = deletionHandler({
    serviceRequest: async (path, init = {}) => {
      if (path.startsWith('/rest/v1/app_admins?')) return new Response('[]', { status: 200 })
      if (path.startsWith('/rest/v1/store_members?')) {
        return new Response(JSON.stringify([{ user_id: targetUserId }]), { status: 200 })
      }
      if (path === `/auth/v1/admin/users/${targetUserId}` && !init.method) {
        return new Response(JSON.stringify({ id: targetUserId, email: 'staff@example.com' }), { status: 200 })
      }
      if (path === `/auth/v1/admin/users/${targetUserId}` && init.method === 'DELETE') {
        return new Response('User owns Storage objects', { status: 400 })
      }
      throw new Error(`unexpected path: ${path}`)
    },
  })
  const { result, res } = jsonRecorder()

  await handler(deleteAccountRequest(), res)

  assert.equal(result.statusCode, 409)
  assert.match(result.body.error, /保存画像/)
})

test('admin API: Auth削除の応答が途切れても再確認で不存在なら成功とする', async () => {
  let authGetCount = 0
  const handler = deletionHandler({
    serviceRequest: async (path, init = {}) => {
      if (path.startsWith('/rest/v1/app_admins?')) return new Response('[]', { status: 200 })
      if (path.startsWith('/rest/v1/store_members?')) {
        return new Response(JSON.stringify([{ user_id: targetUserId }]), { status: 200 })
      }
      if (path === `/auth/v1/admin/users/${targetUserId}` && !init.method) {
        authGetCount += 1
        if (authGetCount === 1) {
          return new Response(JSON.stringify({ id: targetUserId, email: 'staff@example.com' }), { status: 200 })
        }
        return new Response('not found', { status: 404 })
      }
      if (path === `/auth/v1/admin/users/${targetUserId}` && init.method === 'DELETE') {
        throw new Error('connection reset after request')
      }
      throw new Error(`unexpected path: ${path}`)
    },
  })
  const { result, res } = jsonRecorder()

  await handler(deleteAccountRequest(), res)

  assert.equal(result.statusCode, 200)
  assert.equal(authGetCount, 2)
})

test('admin API: Auth削除が5xxでも再確認で不存在なら成功とする', async () => {
  let authGetCount = 0
  const handler = deletionHandler({
    serviceRequest: async (path, init = {}) => {
      if (path.startsWith('/rest/v1/app_admins?')) return new Response('[]', { status: 200 })
      if (path.startsWith('/rest/v1/store_members?')) {
        return new Response(JSON.stringify([{ user_id: targetUserId }]), { status: 200 })
      }
      if (path === `/auth/v1/admin/users/${targetUserId}` && !init.method) {
        authGetCount += 1
        if (authGetCount === 1) {
          return new Response(JSON.stringify({ id: targetUserId, email: 'staff@example.com' }), { status: 200 })
        }
        return new Response('not found', { status: 404 })
      }
      if (path === `/auth/v1/admin/users/${targetUserId}` && init.method === 'DELETE') {
        return new Response('gateway failed after deletion', { status: 502 })
      }
      throw new Error(`unexpected path: ${path}`)
    },
  })
  const { result, res } = jsonRecorder()

  await handler(deleteAccountRequest(), res)

  assert.equal(result.statusCode, 200)
  assert.deepEqual(result.body, { ok: true, userId: targetUserId })
  assert.equal(authGetCount, 2)
})

test('admin API: DELETEも同一オリジンJSON以外を認証前に拒否する', async () => {
  let authenticated = false
  let upstreamCalled = false
  const handler = createBrowserUsersHandler({
    authenticateBoundRequest: async () => {
      authenticated = true
      return { user: { id: actorUserId } }
    },
    requireAdmin: async () => true,
    serviceRequest: async () => {
      upstreamCalled = true
      throw new Error('upstream must not be called')
    },
  })
  const { result, res } = jsonRecorder()

  await handler(deleteAccountRequest(targetUserId, { origin: 'https://evil.example' }), res)

  assert.equal(result.statusCode, 403)
  assert.equal(authenticated, false)
  assert.equal(upstreamCalled, false)
})

test('管理画面: 一般アカウントだけにメール再入力付き削除画面を出し、成功後に一覧を再読込する', async () => {
  const source = await readFile(new URL('../src/components/AdminPanel.jsx', import.meta.url), 'utf8')
  const adminSection = source.slice(source.indexOf('管理者ブラウザ固定'))

  assert.match(source, /function BrowserUserRow\(\{[^}]*onDelete/)
  assert.match(source, /onClick=\{\(\) => onDelete\(user\)\}/)
  assert.match(source, /disabled=\{busy \|\| isCurrent\}/)
  assert.match(source, />アカウント削除<\/button>/)
  assert.match(source, /role="dialog"/)
  assert.match(source, /元に戻せません/)
  assert.match(source, /if \(focusable\.length === 0\)[\s\S]{0,160}event\.preventDefault\(\)[\s\S]{0,160}dialogRef\.current\?\.focus/)
  assert.match(source, /if \(busy\) dialogRef\.current\?\.focus/)
  assert.match(source, /role=\{msg\.type === 'success' \? 'status' : 'alert'\}/)
  assert.match(source, /aria-live="polite"/)
  assert.match(source, /deleteEmail[\s\S]{0,500}deleteTarget\.email/)
  assert.match(source, /deleteReason/)
  assert.match(source, /await browserAdminApi\.remove\([\s\S]{0,160}deleteTarget\.email[\s\S]{0,160}reason/)
  assert.match(source, /setBrowserUsers\(previous => previous\.filter\(user => user\.id !== deletedId\)\)/)
  assert.match(source, /const reloadError = await loadBrowserUsers\(\)/)
  assert.match(source, /一覧の再読込に失敗しました/)
  assert.match(source, /await loadBrowserUsers\(\)/)
  assert.match(source.slice(0, source.indexOf('管理者ブラウザ固定')), /onDelete=\{openDeleteDialog\}/)
  assert.doesNotMatch(adminSection, /onDelete=\{openDeleteDialog\}/)
})
