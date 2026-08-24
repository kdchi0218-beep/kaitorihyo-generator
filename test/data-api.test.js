import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { normalizeDataRequest, withJsonContentType } from '../api/data.js'
import { postData, uploadSignedAsset } from '../src/lib/apiClient.js'
import { mergePersistedAssetUrls, persistSettingsAssets } from '../src/lib/settingsAssets.js'
import { saveTemplate } from '../src/lib/sharedTemplates.js'
import { createSettingsSaveQueue } from '../src/lib/settingsSaveQueue.js'

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

test('data API: 1MBを超える画像埋込みJSONは引き続き拒否する', () => {
  const settings = {
    headerText: 'ポケモンSAR 9x7',
    bgImage: `data:image/jpeg;base64,${'A'.repeat(1_250_000)}`,
  }

  assert.throws(() => normalizeDataRequest({
    action: 'create_template',
    storeId: STORE_ID,
    genre: 'pokemon',
    name: 'ポケモンSAR 9x7',
    settings,
  }), /settings is too large/)
})

test('設定画像: 旧data URLをStorageへ移して軽量URLだけを保存する', async () => {
  const dataUrl = 'data:image/png;base64,aGVsbG8='
  const uploads = []
  const settings = {
    headerText: 'ポケモンSAR 9x7',
    bgImage: dataUrl,
    logoImage: dataUrl,
    placeholderImage: './card-back.jpg',
  }

  const result = await persistSettingsAssets(STORE_ID, settings, {
    upload: async (storeId, file) => {
      uploads.push({ storeId, name: file.name, type: file.type, size: file.size })
      return `/api/asset?path=${encodeURIComponent(`${storeId}/a1efc564-45cf-4f31-b33f-7d25e36d033a.png`)}`
    },
  })

  assert.equal(uploads.length, 1, '同じ画像は一度だけアップロードする')
  assert.deepEqual(uploads[0], {
    storeId: STORE_ID,
    name: 'background.png',
    type: 'image/png',
    size: 5,
  })
  assert.match(result.bgImage, /^\/api\/asset\?path=/)
  assert.equal(result.logoImage, result.bgImage)
  assert.equal(result.placeholderImage, './card-back.jpg')
  assert.equal(result.headerText, settings.headerText)
  assert.equal(settings.bgImage, dataUrl, '元の設定は破壊しない')
})

test('設定画像: 他店舗へ送るとprivate画像を送信先へ複製する', async () => {
  const sourceStoreId = '91efc564-45cf-4f31-b33f-7d25e36d033a'
  const sourcePath = `${sourceStoreId}/a1efc564-45cf-4f31-b33f-7d25e36d033a.webp`
  const sourceUrl = `/api/asset?path=${encodeURIComponent(sourcePath)}`
  const calls = []

  const result = await persistSettingsAssets(STORE_ID, { bgImage: sourceUrl }, {
    fetchAsset: async (url) => {
      calls.push(['fetch', url])
      return new Response(new Blob(['webp'], { type: 'image/webp' }), { status: 200 })
    },
    upload: async (storeId, file) => {
      calls.push(['upload', storeId, file.name, file.type])
      return `/api/asset?path=${encodeURIComponent(`${storeId}/b1efc564-45cf-4f31-b33f-7d25e36d033a.webp`)}`
    },
  })

  assert.deepEqual(calls, [
    ['fetch', sourceUrl],
    ['upload', STORE_ID, 'background.webp', 'image/webp'],
  ])
  assert.notEqual(result.bgImage, sourceUrl)
  assert.match(decodeURIComponent(result.bgImage), new RegExp(STORE_ID))
})

test('設定画像UI: 3種類ともdata URLへ埋め込まずStorageアップロードを使う', async () => {
  const [background, header, grid, sidebar] = await Promise.all([
    readFile(new URL('../src/components/settings/BackgroundSettings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/settings/HeaderSettings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/settings/GridSettings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8'),
  ])
  const imageSettingsSource = [background, header, grid].join('\n')

  assert.doesNotMatch(imageSettingsSource, /FileReader|readAsDataURL/)
  for (const source of [background, header, grid]) {
    assert.match(source, /useSettingAssetUpload/)
    assert.match(source, /storeId/)
    assert.match(source, /uploading/)
    assert.match(source, /role="alert"/)
  }
  assert.match(sidebar, /<BackgroundSettings[^>]+storeId=\{activeStoreId\}/)
  assert.match(sidebar, /<HeaderSettings[^>]+storeId=\{activeStoreId\}/)
  assert.match(sidebar, /<GridSettings[^>]+storeId=\{activeStoreId\}/)
})

test('設定画像UI: アップロード完了前のテンプレ保存と店舗またぎ反映を防ぐ', async () => {
  const [hook, sidebar, templateManager, accordion] = await Promise.all([
    readFile(new URL('../src/hooks/useSettingAssetUpload.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/TemplateManager.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AccordionSection.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(hook, /activeStoreIdRef/)
  assert.match(hook, /activeStoreIdRef\.current !== uploadStoreId/)
  assert.match(hook, /onUploadStateChange/)
  assert.match(sidebar, /assetUploadBusy/)
  assert.match(sidebar, /onUploadStateChange=\{handleAssetUploadStateChange\}/)
  assert.match(sidebar, /<TemplateManager[^>]+assetUploadBusy=\{assetUploadBusy\}/)
  assert.match(templateManager, /assetUploadBusy/)
  assert.match(templateManager, /画像のアップロードが終わってから保存してください/)
  assert.match(templateManager, /disabled=\{busy \|\| assetUploadBusy \|\| !newName\.trim\(\)\}/)
  assert.match(templateManager, /handleLoad[\s\S]{0,180}assetUploadBusy/)
  assert.match(templateManager, /handleReset[\s\S]{0,180}assetUploadBusy/)
  assert.match(accordion, /keepMounted/)
  assert.match(accordion, /keepMounted \|\| open/)
  assert.match(sidebar, /見た目・価格の設定（設定後は折りたたみOK）" keepMounted/)
  for (const title of ['背景設定', 'ヘッダー・ロゴ設定', 'カードグリッド設定']) {
    assert.match(sidebar, new RegExp(`title="${title}" keepMounted`))
  }
})

test('設定画像: 保存中の別編集を壊さず移行した画像URLだけを画面へ反映する', () => {
  const source = { bgColor: '#111111', bgImage: 'data:image/png;base64,aA==' }
  const persisted = { ...source, bgImage: '/api/asset?path=stored.png' }
  const current = { ...source, bgColor: '#222222' }

  assert.deepEqual(mergePersistedAssetUrls(current, source, persisted), {
    bgColor: '#222222',
    bgImage: '/api/asset?path=stored.png',
  })
  assert.equal(
    mergePersistedAssetUrls({ ...current, bgImage: 'newer.png' }, source, persisted).bgImage,
    'newer.png',
  )
})

test('設定保存: 店舗自動保存とテンプレート全経路で旧画像を移行する', async () => {
  const [storeSync, sharedTemplates, templateManager, app] = await Promise.all([
    readFile(new URL('../src/lib/storeSync.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/sharedTemplates.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/TemplateManager.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(storeSync, /persistSettingsAssets\(storeId, settings/)
  assert.ok((sharedTemplates.match(/persistSettingsAssets\(storeId, settings/g) || []).length >= 2)
  assert.match(templateManager, /updateTemplate\(t\.id, t\.name, sourceSettings, storeId\)/)
  assert.match(templateManager, /saveTemplate\(sendTarget, genre, t\.name, t\.settings\)/)
  assert.match(templateManager, /mergePersistedAssetUrls/)
  assert.match(app, /mergePersistedAssetUrls/)
})

test('テンプレート保存: 1MB超の旧背景を先にStorageへ移し、軽量settingsで登録する', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  const storedUrl = `/api/asset?path=${encodeURIComponent(`${STORE_ID}/a1efc564-45cf-4f31-b33f-7d25e36d033a.png`)}`
  globalThis.fetch = async (url, init = {}) => {
    if (url === '/api/data') {
      const body = JSON.parse(init.body)
      requests.push(body)
      if (body.action === 'create_asset_upload') {
        return new Response(JSON.stringify({ data: {
          signedUrl: 'https://signed-upload.example/object',
          assetUrl: storedUrl,
        } }), { status: 200 })
      }
      if (body.action === 'create_template') {
        assert.equal(body.settings.bgImage, storedUrl)
        assert.ok(new TextEncoder().encode(JSON.stringify(body.settings)).byteLength < 1024 * 1024)
        return new Response(JSON.stringify({ data: { id: ITEM_ID } }), { status: 200 })
      }
    }
    if (url === 'https://signed-upload.example/object') {
      assert.ok(init.body instanceof FormData)
      return new Response('{}', { status: 200 })
    }
    throw new Error(`unexpected request: ${url}`)
  }

  try {
    const source = { bgImage: `data:image/png;base64,${'A'.repeat(1_200_000)}` }
    const result = await saveTemplate(STORE_ID, 'pokemon', 'ポケモンSAR 9x7', source)
    assert.equal(result.bgImage, storedUrl)
    assert.deepEqual(requests.map(request => request.action), ['create_asset_upload', 'create_template'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('店舗設定自動保存: 実行中は最新変更をまとめ、古い完了でDBを巻き戻さない', async () => {
  let releaseFirst
  const calls = []
  const saved = []
  const queue = createSettingsSaveQueue({
    save: async (_storeId, settings) => {
      calls.push(settings)
      if (calls.length === 1) await new Promise(resolve => { releaseFirst = resolve })
      return settings.bgImage?.startsWith('data:')
        ? { ...settings, bgImage: '/api/asset?path=migrated.png' }
        : settings
    },
    onSaved: (_storeId, source, persisted) => saved.push({ source, persisted }),
    onError: error => assert.fail(error),
  })

  queue.enqueue(STORE_ID, { headerText: '古い', bgImage: 'data:image/png;base64,aA==' })
  await new Promise(resolve => setTimeout(resolve, 0))
  queue.enqueue(STORE_ID, { headerText: '最新', bgImage: 'data:image/png;base64,aA==' })
  releaseFirst()
  await queue.whenIdle(STORE_ID)

  assert.equal(calls.length, 2)
  assert.equal(calls[1].headerText, '最新')
  assert.equal(calls[1].bgImage, '/api/asset?path=migrated.png', '移行済みURLを次の保存でも再利用する')
  assert.equal(saved.at(-1).persisted.headerText, '最新')
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
