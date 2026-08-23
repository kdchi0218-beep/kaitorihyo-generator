import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'

import {
  createExporter,
  fetchImageAsDataUrl,
  inlineImagesForExport,
} from '../src/lib/exporter.js'

test('画像出力: 複数ページを1枚ずつ処理し、復元してからバイナリでZIPへ追加する', async () => {
  const events = []
  const files = []
  const downloads = []
  const pages = [{ id: 'page-1' }, { id: 'page-2' }, { id: 'page-3' }]

  const exporter = createExporter({
    prepareImages: async (_page, index) => {
      events.push(`prepare:${index}`)
      return {
        success: 1,
        total: 1,
        restore: () => events.push(`restore:${index}`),
      }
    },
    renderPage: async (_page, _format, index) => {
      events.push(`render:${index}`)
      return new Blob([`page-${index}`], { type: 'image/png' })
    },
    createZip: () => ({
      file(name, data) {
        events.push(`zip:${name}`)
        files.push({ name, data })
      },
      async generateAsync() {
        events.push('generate')
        return new Blob(['zip'], { type: 'application/zip' })
      },
    }),
    downloadBlob: async (blob, name) => downloads.push({ blob, name }),
    yieldToBrowser: async () => events.push('yield'),
  })

  await exporter(pages, 'png', '買取表')

  assert.deepEqual(events, [
    'prepare:0', 'render:0', 'restore:0', 'zip:買取表_1.png', 'yield',
    'prepare:1', 'render:1', 'restore:1', 'zip:買取表_2.png', 'yield',
    'prepare:2', 'render:2', 'restore:2', 'zip:買取表_3.png',
    'generate',
  ])
  assert.deepEqual(files.map(file => file.name), [
    '買取表_1.png', '買取表_2.png', '買取表_3.png',
  ])
  assert.ok(files.every(file => file.data instanceof Uint8Array))
  assert.deepEqual(
    files.map(file => new TextDecoder().decode(file.data)),
    ['page-0', 'page-1', 'page-2'],
  )
  assert.equal(downloads.length, 1)
  assert.equal(downloads[0].name, '買取表.zip')
  assert.equal(downloads[0].blob.type, 'application/zip')
})

test('画像出力: 途中で失敗しても画像を元に戻し、失敗ページを案内する', async () => {
  const restored = []
  const downloads = []
  const exporter = createExporter({
    prepareImages: async (_page, index) => ({
      success: 1,
      total: 1,
      restore: () => restored.push(index),
    }),
    renderPage: async (_page, _format, index) => {
      if (index === 1) throw new Error('canvas allocation failed')
      return new Blob(['ok'], { type: 'image/png' })
    },
    createZip: () => ({
      file() {},
      async generateAsync() { return new Blob(['zip']) },
    }),
    downloadBlob: async (...args) => downloads.push(args),
    yieldToBrowser: async () => {},
  })

  await assert.rejects(
    exporter([{}, {}, {}], 'png', '買取表'),
    /2ページ目.*canvas allocation failed/,
  )
  assert.deepEqual(restored, [0, 1])
  assert.equal(downloads.length, 0)
})

test('画像出力: 1枚でも画像を取得できなければ穴あきのまま描画しない', async () => {
  let rendered = false
  let restored = false
  const exporter = createExporter({
    prepareImages: async () => ({
      success: 2,
      total: 3,
      failures: [{ source: 'https://files.cardrush.media/missing.webp' }],
      restore: () => { restored = true },
    }),
    renderPage: async () => {
      rendered = true
      return new Blob(['broken'], { type: 'image/png' })
    },
    downloadBlob: async () => {},
  })

  await assert.rejects(
    exporter([{}], 'png', '買取表'),
    /1ページ目.*カード画像1枚を取得できません.*もう一度出力/,
  )
  assert.equal(rendered, false)
  assert.equal(restored, true)
})

test('画像出力: 画像プロキシの一時失敗を再試行して復旧する', async () => {
  const calls = []
  const waits = []
  const successfulResponse = { ok: true, status: 200 }

  const result = await fetchImageAsDataUrl('https://files.cardrush.media/card.webp', {
    fetchImpl: async url => {
      calls.push(url)
      if (calls.length === 1) throw new TypeError('CORS blocked')
      if (calls.length === 2) return { ok: false, status: 503 }
      if (calls.length === 3) throw new TypeError('temporary network error')
      return successfulResponse
    },
    responseToDataUrl: async response => {
      assert.equal(response, successfulResponse)
      return 'data:image/webp;base64,b2s='
    },
    waitForRetry: async delay => waits.push(delay),
    proxyAttempts: 3,
  })

  assert.equal(result, 'data:image/webp;base64,b2s=')
  assert.equal(calls.length, 4)
  assert.equal(calls[0], 'https://files.cardrush.media/card.webp')
  assert.ok(calls.slice(1).every(url => url.startsWith('/api/image-proxy?url=')))
  assert.deepEqual(waits.length, 2)
  assert.ok(waits.every(delay => delay > 0))
})

test('画像出力: 再試行を尽くしても取得できない画像は失敗として返す', async () => {
  let callCount = 0

  await assert.rejects(
    fetchImageAsDataUrl('https://files.cardrush.media/missing.webp', {
      fetchImpl: async () => {
        callCount++
        return { ok: false, status: callCount === 1 ? 0 : 503 }
      },
      responseToDataUrl: async () => 'unused',
      waitForRetry: async () => {},
      proxyAttempts: 3,
    }),
    /画像プロキシ.*3回.*503/,
  )
  assert.equal(callCount, 4)
})

test('画像出力: 永続的な4xxは無駄に再試行しない', async () => {
  let callCount = 0

  await assert.rejects(
    fetchImageAsDataUrl('https://unsupported.example/card.webp', {
      fetchImpl: async () => {
        callCount++
        return { ok: false, status: callCount === 1 ? 0 : 403 }
      },
      responseToDataUrl: async () => 'unused',
      waitForRetry: async () => {},
      proxyAttempts: 3,
    }),
    /画像プロキシ.*1回.*403/,
  )
  assert.equal(callCount, 2)
})

test('画像出力: data URLのデコード失敗を成功扱いせずDOMを復元する', async () => {
  const attributes = new Map([
    ['src', 'https://files.cardrush.media/broken.webp'],
    ['srcset', 'https://files.cardrush.media/broken@2x.webp 2x'],
  ])
  const image = {
    currentSrc: 'https://files.cardrush.media/broken.webp',
    alt: '破損カード',
    getAttribute: name => attributes.has(name) ? attributes.get(name) : null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
    decode: async () => { throw new Error('decode failed') },
  }
  Object.defineProperty(image, 'src', {
    get: () => attributes.get('src') || '',
    set: value => { attributes.set('src', value) },
  })
  const container = { querySelectorAll: () => [image] }

  const prepared = await inlineImagesForExport(container, {
    loadImage: async () => 'data:image/webp;base64,YmFk',
    concurrency: 1,
  })

  assert.equal(prepared.success, 0)
  assert.equal(prepared.total, 1)
  assert.equal(prepared.failures.length, 1)
  assert.equal(prepared.failures[0].alt, '破損カード')
  prepared.restore()
  assert.equal(attributes.get('src'), 'https://files.cardrush.media/broken.webp')
  assert.equal(attributes.get('srcset'), 'https://files.cardrush.media/broken@2x.webp 2x')
})

test('画像出力: 1ページならZIPを作らず画像Blobを直接保存する', async () => {
  let zipCreated = false
  const downloads = []
  const png = new Blob(['png'], { type: 'image/png' })
  const exporter = createExporter({
    prepareImages: async () => ({ success: 0, total: 0, restore() {} }),
    renderPage: async () => png,
    createZip: () => {
      zipCreated = true
      throw new Error('1ページでは呼ばれない')
    },
    downloadBlob: async (blob, name) => downloads.push({ blob, name }),
    yieldToBrowser: async () => {},
  })

  await exporter([{}], 'png', '買取表')

  assert.equal(zipCreated, false)
  assert.deepEqual(downloads, [{ blob: png, name: '買取表.png' }])
})

test('画像出力: 実際のJSZipで複数画像を壊さずZIP化する', async () => {
  let download
  const exporter = createExporter({
    prepareImages: async () => ({ success: 0, total: 0, restore() {} }),
    renderPage: async (_page, _format, index) =>
      new Blob([`image-${index}`], { type: 'image/png' }),
    downloadBlob: async (blob, name) => { download = { blob, name } },
    yieldToBrowser: async () => {},
  })

  await exporter([{}, {}], 'png', '動作確認')

  assert.equal(download.name, '動作確認.zip')
  const zip = await JSZip.loadAsync(await download.blob.arrayBuffer())
  assert.deepEqual(Object.keys(zip.files), ['動作確認_1.png', '動作確認_2.png'])
  assert.equal(await zip.file('動作確認_1.png').async('string'), 'image-0')
  assert.equal(await zip.file('動作確認_2.png').async('string'), 'image-1')
})

test('画像出力: JPEGは白背景用の形式をレンダーへ渡し、jpg名でZIP化する', async () => {
  const renderedFormats = []
  const fileNames = []
  let downloadName
  const exporter = createExporter({
    prepareImages: async () => ({ success: 0, total: 0, restore() {} }),
    renderPage: async (_page, format) => {
      renderedFormats.push(format)
      return new Blob(['jpeg'], { type: 'image/jpeg' })
    },
    createZip: () => ({
      file(name) { fileNames.push(name) },
      async generateAsync() { return new Blob(['zip'], { type: 'application/zip' }) },
    }),
    downloadBlob: async (_blob, name) => { downloadName = name },
    yieldToBrowser: async () => {},
  })

  await exporter([{}, {}], 'jpeg', '買取表')

  assert.deepEqual(renderedFormats, ['jpeg', 'jpeg'])
  assert.deepEqual(fileNames, ['買取表_1.jpg', '買取表_2.jpg'])
  assert.equal(downloadName, '買取表.zip')
})
