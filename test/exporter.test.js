import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'

import { createExporter } from '../src/lib/exporter.js'

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
