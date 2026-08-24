import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { normalizeAccountRequest, provisionStoreUser } from '../api/admin/create-user.js'
import { createUserInStore } from '../src/lib/storeSync.js'
import * as accountPassword from '../src/lib/accountPassword.js'

const storeId = '81efc564-45cf-4f31-b33f-7d25e36d033a'

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
