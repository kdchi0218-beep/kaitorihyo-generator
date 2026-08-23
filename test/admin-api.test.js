import { test } from 'node:test'
import assert from 'node:assert/strict'

import { normalizeAccountRequest, provisionStoreUser } from '../api/admin/create-user.js'

test('admin API: emailとstoreIdを正規化し、12文字以上のパスワードを要求する', () => {
  assert.deepEqual(normalizeAccountRequest({
    email: ' Staff@Example.COM ',
    password: 'long-password-123',
    storeId: '81efc564-45cf-4f31-b33f-7d25e36d033a',
  }), {
    email: 'staff@example.com',
    password: 'long-password-123',
    storeId: '81efc564-45cf-4f31-b33f-7d25e36d033a',
  })
  assert.throws(() => normalizeAccountRequest({
    email: 'staff@example.com',
    password: 'short',
    storeId: '81efc564-45cf-4f31-b33f-7d25e36d033a',
  }), /パスワード/)
  assert.throws(() => normalizeAccountRequest({
    email: 'invalid',
    invite: true,
    storeId: '81efc564-45cf-4f31-b33f-7d25e36d033a',
  }), /メール/)
})

test('admin API: 未実装の招待方式を受け付けず、必ず初期パスワードを要求する', () => {
  assert.throws(() => normalizeAccountRequest({
    email: 'staff@example.com',
    storeId: '81efc564-45cf-4f31-b33f-7d25e36d033a',
    invite: true,
  }), /パスワード/)
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
    storeId: '81efc564-45cf-4f31-b33f-7d25e36d033a',
  }, request), /店舗メンバー/)

  assert.equal(calls.length, 3)
  assert.equal(calls[2].path, `/auth/v1/admin/users/${userId}`)
  assert.equal(calls[2].init.method, 'DELETE')
})
