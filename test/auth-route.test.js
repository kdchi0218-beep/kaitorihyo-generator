import test from 'node:test'
import assert from 'node:assert/strict'

import loginHandler from '../api/auth/login.js'

function responseRecorder() {
  const result = { status: null, body: null, headers: {} }
  return {
    result,
    res: {
      setHeader: (name, value) => { result.headers[name] = value },
      status: status => ({ json: body => { result.status = status; result.body = body } }),
    },
  }
}

test('auth route: form POSTと異なるoriginからのログイン固定を拒否する', async () => {
  const form = responseRecorder()
  await loginHandler({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', host: 'tonton.example' },
    body: { email: 'staff@example.com', password: 'password' },
  }, form.res)
  assert.equal(form.result.status, 415)

  const crossSite = responseRecorder()
  await loginHandler({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'tonton.example',
      origin: 'https://attacker.example',
    },
    body: { email: 'staff@example.com', password: 'password' },
  }, crossSite.res)
  assert.equal(crossSite.result.status, 403)
  assert.equal(crossSite.result.body.code, 'ORIGIN_NOT_ALLOWED')
})
