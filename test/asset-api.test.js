import test from 'node:test'
import assert from 'node:assert/strict'

import { fetchBoundAsset, normalizeAssetPath } from '../api/asset.js'
import { buildAssetProxyUrl } from '../api/data.js'

const STORE_ID = '81efc564-45cf-4f31-b33f-7d25e36d033a'
const FILE_ID = 'a1efc564-45cf-4f31-b33f-7d25e36d033a'
const PATH = `${STORE_ID}/${FILE_ID}.png`

test('asset API: 自店UUID配下の生成済み画像パスだけを許可する', () => {
  assert.deepEqual(normalizeAssetPath(PATH), { path: PATH, storeId: STORE_ID })
  assert.throws(() => normalizeAssetPath(`${STORE_ID}/../secret.png`), /path/)
  assert.throws(() => normalizeAssetPath(`${STORE_ID}/logo.svg`), /path/)
  assert.equal(buildAssetProxyUrl(PATH), `/api/asset?path=${encodeURIComponent(PATH)}`)
})

test('asset API: ブラウザRLSで店舗権限を確認してからprivate Storage画像だけを返す', async () => {
  const calls = []
  const auth = { user: { id: 'u1' }, accessToken: 'jwt', deviceId: 'd1', deviceSecret: 's1' }
  const result = await fetchBoundAsset(auth, PATH, {
    userRequest: async (_auth, path) => {
      calls.push(path)
      return new Response(JSON.stringify([{ id: STORE_ID }]), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    },
    storageRequest: async path => {
      calls.push(path)
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/png', 'Content-Length': '3' },
      })
    },
  })
  assert.equal(result.contentType, 'image/png')
  assert.deepEqual([...result.bytes], [1, 2, 3])
  assert.match(calls[0], /\/rest\/v1\/stores/)
  assert.equal(calls[1], `/storage/v1/object/store-assets/${PATH}`)
})

test('asset API: 所属外・非画像・10MB超過を返さない', async () => {
  const auth = { user: { id: 'u1' }, accessToken: 'jwt', deviceId: 'd1', deviceSecret: 's1' }
  await assert.rejects(() => fetchBoundAsset(auth, PATH, {
    userRequest: async () => new Response('[]', { status: 200 }),
    storageRequest: async () => { throw new Error('must not fetch') },
  }), error => error.statusCode === 403)

  await assert.rejects(() => fetchBoundAsset(auth, PATH, {
    userRequest: async () => new Response(JSON.stringify([{ id: STORE_ID }]), { status: 200 }),
    storageRequest: async () => new Response('<svg/>', {
      status: 200, headers: { 'Content-Type': 'image/svg+xml' },
    }),
  }), /content type/)

  await assert.rejects(() => fetchBoundAsset(auth, PATH, {
    maxBytes: 2,
    userRequest: async () => new Response(JSON.stringify([{ id: STORE_ID }]), { status: 200 }),
    storageRequest: async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200, headers: { 'Content-Type': 'image/png' },
    }),
  }), /too large/)
})
