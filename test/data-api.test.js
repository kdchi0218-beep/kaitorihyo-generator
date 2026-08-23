import { test } from 'node:test'
import assert from 'node:assert/strict'

import { normalizeDataRequest, withJsonContentType } from '../api/data.js'
import { postData, uploadSignedAsset } from '../src/lib/apiClient.js'

const STORE_ID = '81efc564-45cf-4f31-b33f-7d25e36d033a'
const ITEM_ID = 'a1efc564-45cf-4f31-b33f-7d25e36d033a'

test('data API: actionをホワイトリストし、必要なUUIDを検証する', () => {
  assert.deepEqual(normalizeDataRequest({ action: 'load_settings', storeId: STORE_ID }), {
    action: 'load_settings', storeId: STORE_ID,
  })
  assert.throws(() => normalizeDataRequest({ action: 'drop_table' }), /invalid action/)
  assert.throws(() => normalizeDataRequest({ action: 'load_settings', storeId: 'not-a-uuid' }), /storeId/)
})

test('data API: テンプレートと定番リストの入力を正規化する', () => {
  assert.deepEqual(normalizeDataRequest({
    action: 'create_template', storeId: STORE_ID, genre: 'pokemon', name: '  通常  ', settings: { color: '#fff' },
  }), {
    action: 'create_template', storeId: STORE_ID, genre: 'pokemon', name: '通常', settings: { color: '#fff' },
  })
  assert.throws(() => normalizeDataRequest({
    action: 'save_card_list', id: ITEM_ID, items: { not: 'an array' },
  }), /items/)
  assert.throws(() => normalizeDataRequest({
    action: 'list_card_lists', storeId: STORE_ID, genre: '',
  }), /genre/)
})

test('data API: 店舗設定保存時に検証済みsettingsをBFFへ渡す', () => {
  assert.deepEqual(normalizeDataRequest({
    action: 'save_settings', storeId: STORE_ID, settings: { background: '#fff' },
  }), {
    action: 'save_settings', storeId: STORE_ID, settings: { background: '#fff' },
  })
  assert.throws(() => normalizeDataRequest({
    action: 'save_settings', storeId: STORE_ID, settings: [],
  }), /settings/)
})

test('data API: SupabaseへのJSON書込みはapplication/jsonとして送る', () => {
  const request = withJsonContentType({
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: 'とんとん' }),
  })

  assert.equal(request.headers['Content-Type'], 'application/json')
  assert.equal(request.headers.Prefer, 'return=representation')
  assert.deepEqual(JSON.parse(request.body), { name: 'とんとん' })
})

test('data API: bodyがない読込みではContent-Typeを勝手に追加しない', () => {
  assert.deepEqual(withJsonContentType({ method: 'GET' }), { method: 'GET' })
})

test('data API: Headersインスタンスでも既存ヘッダーを保ったままJSONを指定する', () => {
  const request = withJsonContentType({
    method: 'PATCH',
    headers: new Headers({ Prefer: 'return=representation' }),
    body: JSON.stringify({ name: '更新' }),
  })

  assert.equal(request.headers.get('Content-Type'), 'application/json')
  assert.equal(request.headers.get('Prefer'), 'return=representation')
})

test('data API: signed upload は安全な画像種別とサイズだけを受け付ける', () => {
  const upload = normalizeDataRequest({
    action: 'create_asset_upload', storeId: STORE_ID, filename: 'logo.png', contentType: 'image/png', size: 1024,
  })
  assert.equal(upload.contentType, 'image/png')
  assert.throws(() => normalizeDataRequest({
    action: 'create_asset_upload', storeId: STORE_ID, filename: 'bad.svg', contentType: 'image/svg+xml', size: 10,
  }), /contentType/)
  assert.throws(() => normalizeDataRequest({
    action: 'create_asset_upload', storeId: STORE_ID, filename: 'huge.png', contentType: 'image/png', size: 11 * 1024 * 1024,
  }), /size/)
})

test('data client: Cookie付きBFFを呼び、固定解除待ちの423をアプリへ通知する', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const events = []
  globalThis.window = { dispatchEvent: event => events.push(event.detail) }
  globalThis.fetch = async (path, init) => {
    assert.equal(path, '/api/data')
    assert.equal(init.credentials, 'same-origin')
    assert.match(init.body, /list_my_stores/)
    return new Response(JSON.stringify({ error: 'BROWSER_LOCKED', code: 'BROWSER_LOCKED' }), { status: 423 })
  }
  try {
    await assert.rejects(() => postData('list_my_stores'), /BROWSER_LOCKED/)
    assert.deepEqual(events, [{ status: 423, code: 'BROWSER_LOCKED' }])
  } finally {
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  }
})

test('data client: signed uploadはmultipartで送りJWTや固定秘密値を付けない', async () => {
  const originalFetch = globalThis.fetch
  let captured
  globalThis.fetch = async (url, init) => {
    captured = { url, init }
    return new Response(JSON.stringify({ Key: 'store-assets/path.png' }), { status: 200 })
  }
  try {
    const file = new Blob(['png'], { type: 'image/png' })
    const publicUrl = await uploadSignedAsset({
      signedUrl: 'https://project.supabase.co/storage/v1/object/upload/sign/store-assets/path.png?token=once',
      assetUrl: '/api/asset?path=path.png',
    }, file)
    assert.equal(publicUrl, '/api/asset?path=path.png')
    assert.ok(captured.init.body instanceof FormData)
    assert.equal(captured.init.headers['x-upsert'], 'false')
    assert.equal(captured.init.headers['Content-Type'], undefined)
    assert.equal(captured.init.headers.Authorization, undefined)
  } finally {
    globalThis.fetch = originalFetch
  }
})
