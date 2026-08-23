import test from 'node:test'
import assert from 'node:assert/strict'

import { validateSameOriginJson } from '../api/_lib/request-security.js'

test('request security: 同一originのJSON POSTだけを受け付ける', () => {
  assert.deepEqual(validateSameOriginJson({ headers: {
    'content-type': 'application/json; charset=utf-8',
    origin: 'https://tonton.example',
    host: 'tonton.example',
    'x-forwarded-proto': 'https',
  } }), { ok: true })

  assert.equal(validateSameOriginJson({ headers: {
    'content-type': 'text/plain',
    origin: 'https://tonton.example',
    host: 'tonton.example',
  } }).code, 'UNSUPPORTED_MEDIA_TYPE')

  assert.equal(validateSameOriginJson({ headers: {
    'content-type': 'application/jsonp',
    origin: 'https://tonton.example',
    host: 'tonton.example',
  } }).code, 'UNSUPPORTED_MEDIA_TYPE')

  assert.equal(validateSameOriginJson({ headers: {
    'content-type': 'application/json',
    origin: 'https://evil.vercel.app',
    host: 'tonton.vercel.app',
    'x-forwarded-proto': 'https',
  } }).code, 'ORIGIN_NOT_ALLOWED')

  assert.equal(validateSameOriginJson({ headers: {
    'content-type': 'application/json',
    host: 'tonton.example',
  } }).code, 'ORIGIN_REQUIRED')
})
