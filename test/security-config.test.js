import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Vercel: XSS・クリックジャッキング・MIME sniffingを防ぐ応答ヘッダーを全画面へ付ける', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  const headers = new Map(config.headers?.find(rule => rule.source === '/(.*)')?.headers
    ?.map(header => [header.key.toLowerCase(), header.value]) || [])
  assert.match(headers.get('content-security-policy') || '', /script-src 'self'/)
  assert.match(headers.get('content-security-policy') || '', /object-src 'none'/)
  assert.match(headers.get('content-security-policy') || '', /frame-ancestors 'none'/)
  assert.equal(headers.get('x-content-type-options'), 'nosniff')
  assert.equal(headers.get('x-frame-options'), 'DENY')
  assert.equal(headers.get('referrer-policy'), 'no-referrer')
})
