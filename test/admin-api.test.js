import { test } from 'node:test'
import assert from 'node:assert/strict'

import { normalizeAccountRequest } from '../api/admin/create-user.js'

test('admin API: emailとstoreIdを正規化し、12文字以上のパスワードを要求する', () => {
  assert.deepEqual(normalizeAccountRequest({
    email: ' Staff@Example.COM ',
    password: 'long-password-123',
    storeId: '81efc564-45cf-4f31-b33f-7d25e36d033a',
  }), {
    email: 'staff@example.com',
    password: 'long-password-123',
    storeId: '81efc564-45cf-4f31-b33f-7d25e36d033a',
    inviteMode: false,
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

test('admin API: 招待方式はパスワードなしで受け付ける', () => {
  const value = normalizeAccountRequest({
    email: 'staff@example.com',
    storeId: '81efc564-45cf-4f31-b33f-7d25e36d033a',
    invite: true,
  })
  assert.equal(value.inviteMode, true)
  assert.equal(value.password, '')
})
