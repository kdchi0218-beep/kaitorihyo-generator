import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildBuyingPricesUrl,
  buildProductUrl,
  buildSearchBoxUrl,
  normalizeGenre,
  normalizeProductIds,
} from '../api/_lib/cardrush-config.js'
import {
  extractNextData,
  extractProductFromHtml,
  extractSearchResultsFromHtml,
} from '../api/_lib/cardrush-parsers.js'
import { isScraperAuthorized } from '../api/_lib/scraper-auth.js'
import { createScrapeCache, makeScrapeCacheKey } from '../api/_lib/scrape-cache.js'
import { fetchImageAsset, parseAllowedImageUrl } from '../api/image-proxy.js'
import { parseProductsBody } from '../api/cardrush/products.js'

test('cardrush config: 許可ジャンルだけを正規化する', () => {
  assert.equal(normalizeGenre('pokemon'), 'pokemon')
  assert.equal(normalizeGenre('onepiece'), 'onepiece')
  assert.throws(() => normalizeGenre('yugioh'), /genre/)
})

test('cardrush config: 買取価格URLは固定ドメインへ安全に組み立てる', () => {
  const url = new URL(buildBuyingPricesUrl({
    genre: 'pokemon',
    name: 'ピカチュウ & ミュウ',
    modelNumber: '001/100',
    rarity: 'SAR',
  }))
  assert.equal(url.origin, 'https://cardrush.media')
  assert.equal(url.pathname, '/pokemon/buying_prices')
  assert.equal(url.searchParams.get('name'), 'ピカチュウ & ミュウ')
  assert.equal(url.searchParams.get('model_number'), '001/100')
  assert.equal(url.searchParams.get('rarity'), 'SAR')
  assert.equal(url.searchParams.get('limit'), '50')
})

test('cardrush config: 商品・BOX検索URLはジャンルごとの固定ECドメインを使う', () => {
  assert.equal(buildProductUrl('pokemon', '72874'), 'https://www.cardrush-pokemon.jp/product/72874')
  assert.equal(buildProductUrl('onepiece', 3382), 'https://www.cardrush-op.jp/product/3382')
  assert.match(buildSearchBoxUrl('pokemon', 'MEGAドリームex'), /^https:\/\/www\.cardrush-pokemon\.jp\/product-list\?/)
  assert.throws(() => buildProductUrl('pokemon', '../admin'), /id/)
})

test('cardrush config: 商品ID配列を重複排除し、上限を超えた入力は拒否する', () => {
  assert.deepEqual(normalizeProductIds([43860, '43860', '45925']), ['43860', '45925'])
  assert.throws(() => normalizeProductIds([]), /ids/)
  assert.throws(() => normalizeProductIds(['abc']), /id/)
  assert.throws(() => normalizeProductIds(Array.from({ length: 26 }, (_, index) => index + 1)), /25/)
})

test('products API: 不正JSONと配列bodyは400対象の入力エラーにする', () => {
  assert.deepEqual(parseProductsBody('{"genre":"pokemon","ids":["1"]}'), {
    genre: 'pokemon',
    ids: ['1'],
  })
  assert.throws(() => parseProductsBody('{broken'), /invalid JSON body/)
  assert.throws(() => parseProductsBody([]), /invalid request body/)
})

test('image proxy: HTTPSの許可ホストだけを受け付ける', () => {
  assert.equal(
    parseAllowedImageUrl('https://example.supabase.co/storage/v1/object/public/a.jpg').hostname,
    'example.supabase.co',
  )
  assert.throws(() => parseAllowedImageUrl('http://example.supabase.co/a.jpg'), /https/)
  assert.throws(() => parseAllowedImageUrl('https://example.supabase.co:444/a.jpg'), /port/)
  assert.throws(() => parseAllowedImageUrl('https://supabase.co.attacker.example/a.jpg'), /domain/)
})

test('image proxy: リダイレクトと画像以外を中継しない', async () => {
  await assert.rejects(
    () => fetchImageAsset('https://example.supabase.co/a.jpg', {
      fetchImpl: async () => new Response('', { status: 302, headers: { Location: 'http://127.0.0.1/' } }),
    }),
    /redirect/,
  )
  await assert.rejects(
    () => fetchImageAsset('https://example.supabase.co/a.jpg', {
      fetchImpl: async () => new Response('<html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    }),
    /content type/,
  )
})

test('image proxy: Content-Lengthの有無にかかわらず容量上限を強制する', async () => {
  const bytes = new Uint8Array(12)
  await assert.rejects(
    () => fetchImageAsset('https://example.supabase.co/a.jpg', {
      maxBytes: 10,
      fetchImpl: async () => new Response(bytes, {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      }),
    }),
    /too large/,
  )
})

test('cardrush parser: __NEXT_DATA__をJSONとして取り出す', () => {
  const html = '<html><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"ok":true}}}</script></html>'
  assert.equal(extractNextData(html).props.pageProps.ok, true)
  assert.throws(() => extractNextData('<html></html>'), /NEXT_DATA/)
})

test('cardrush parser: 商品HTMLから名称・販売価格・商品画像を抽出する', () => {
  const html = `
    <html><head><title>ピカチュウ SAR - カードラッシュ</title></head>
    <body>
      <img src="/data/cardrushpokemon/product/123.jpeg" alt="画像1: ピカチュウ">
      <div>販売価格 12,800円</div>
    </body></html>`
  assert.deepEqual(extractProductFromHtml(html, 'https://www.cardrush-pokemon.jp/product/123'), {
    name: 'ピカチュウ SAR',
    sellingPrice: 12800,
    imageUrl: 'https://www.cardrush-pokemon.jp/data/cardrushpokemon/product/123.jpeg',
  })
})

test('cardrush parser: 商品検索HTMLからBOX候補だけを抽出・重複排除する', () => {
  const html = `
    <a href="/product/10"><img src="/images/10.jpg"><p>MEGAドリームex BOX</p></a>
    <a href="/product/10"><p>MEGAドリームex BOX</p></a>
    <a href="/product/11"><p>MEGAドリームex パック</p></a>
    <a href="https://www.cardrush-pokemon.jp/product/12"><p>未開封ボックス</p></a>`
  assert.deepEqual(extractSearchResultsFromHtml(html, 'https://www.cardrush-pokemon.jp/product-list?keyword=x'), [
    {
      productId: '10',
      productName: 'MEGAドリームex BOX',
      imageUrl: 'https://www.cardrush-pokemon.jp/images/10.jpg',
      productUrl: 'https://www.cardrush-pokemon.jp/product/10',
    },
    {
      productId: '12',
      productName: '未開封ボックス',
      imageUrl: '',
      productUrl: 'https://www.cardrush-pokemon.jp/product/12',
    },
  ])
})

test('scraper auth: 専用キーをヘッダーまたはBearerで検証する', () => {
  const expected = 'test-secret-key-with-enough-length'
  assert.equal(isScraperAuthorized({ headers: { 'x-scraper-key': expected } }, expected), true)
  assert.equal(isScraperAuthorized({ headers: { authorization: `Bearer ${expected}` } }, expected), true)
  assert.equal(isScraperAuthorized({ headers: { 'x-scraper-key': 'wrong' } }, expected), false)
  assert.equal(isScraperAuthorized({ headers: {} }, expected), false)
  assert.equal(isScraperAuthorized({ headers: { 'x-scraper-key': expected } }, ''), false)
  assert.equal(isScraperAuthorized({ headers: { 'x-scraper-key': 'too-short' } }, 'too-short'), false)
})

test('scrape cache: 同じ入力から安定した短いキャッシュキーを作る', () => {
  const a = makeScrapeCacheKey(['prices', 'pokemon', 'ピカチュウ', '001/100', 'SAR'])
  const b = makeScrapeCacheKey(['prices', 'pokemon', 'ピカチュウ', '001/100', 'SAR'])
  const c = makeScrapeCacheKey(['prices', 'pokemon', 'ミュウ', '001/100', 'SAR'])
  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.match(a, /^[a-f0-9]{64}$/)
})

test('scrape cache: Supabase service keyだけで期限内データを読み書きする', async () => {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    if (!init.method || init.method === 'GET') {
      return new Response(JSON.stringify([{ payload: { ok: true } }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('', { status: 201 })
  }
  const cache = createScrapeCache({
    fetchImpl,
    env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'service-secret' },
  })

  assert.deepEqual(await cache.get('cardrush_product', 'abc'), { ok: true })
  await cache.set('cardrush_product', 'abc', { ok: false }, 3_600)

  assert.equal(calls.length, 2)
  assert.match(calls[0].url, /^https:\/\/project\.supabase\.co\/rest\/v1\/scrape_cache\?/)
  assert.equal(calls[0].init.headers.apikey, 'service-secret')
  assert.equal(calls[1].init.method, 'POST')
  assert.equal(calls[1].init.headers.Prefer, 'resolution=merge-duplicates,return=minimal')
  const body = JSON.parse(calls[1].init.body)
  assert.equal(body.source, 'cardrush_product')
  assert.equal(body.cache_key, 'abc')
  assert.deepEqual(body.payload, { ok: false })
})

test('scrape cache: 未設定環境ではDBを呼ばずに無効化される', async () => {
  let called = false
  const cache = createScrapeCache({
    fetchImpl: async () => { called = true },
    env: {},
  })
  assert.equal(await cache.get('x', 'y'), null)
  assert.equal(await cache.set('x', 'y', {}, 60), false)
  assert.equal(called, false)
})
