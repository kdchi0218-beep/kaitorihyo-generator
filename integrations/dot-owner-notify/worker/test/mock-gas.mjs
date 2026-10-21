// 検証用の模擬GAS。本物の morning-brief-delivery-module.js の push_brief_v2 / push_brief_v2_status と同じ
// 入力チェック・受領記録（idempotency）・応答形式を真似る。本物と同じくPOSTには302で応答し、
// リダイレクト先のGETで結果JSONを返す（Workerのfetchがリダイレクトを正しく辿るかの確認用）。
// LINEには何も送らない。「送ったことにした」記録をメモリに残し、/control/pushes で取り出せる。

import { createHash } from 'node:crypto'
import { createServer } from 'node:http'

export function startMockGas({ port, apiKey }) {
  const state = {
    mode: 'ok',            // ok / error_disabled / error_configuration / uncertain / html
    ownerCount: 1,
    receipts: new Map(),   // idempotency_key -> { digest, status }
    pushes: [],            // 送ったことにしたメッセージ
    calls: [],             // 受け取った呼び出し（keyは記録しない）
    echoes: new Map(),
    nextEcho: 1,
  }

  const reply = (res, payload) => {
    const id = String(state.nextEcho++)
    state.echoes.set(id, payload)
    res.writeHead(302, { Location: `http://127.0.0.1:${port}/macros/echo?user_content_key=${id}` })
    res.end()
  }

  const handlePost = (req, body, res) => {
    const contentType = req.headers['content-type'] || ''
    const params = Object.fromEntries(new URLSearchParams(body))
    const keys = Object.keys(params).sort()
    state.calls.push({ action: params.action, keys, contentType })

    if (contentType !== 'application/x-www-form-urlencoded') {
      return reply(res, { status: 'error', action: params.action, code: 'invalid_request' })
    }
    if (params.key !== apiKey) return reply(res, { status: 'error', action: params.action, code: 'unauthorized' })

    if (params.action === 'push_brief_v2_status') {
      if (keys.join(',') !== 'action,key') return reply(res, { status: 'error', action: params.action, code: 'invalid_request' })
      return reply(res, {
        status: 'ok', action: params.action,
        result: { ownerCount: state.ownerCount, configReady: state.ownerCount === 1, tokenPresent: true },
      })
    }

    if (params.action !== 'push_brief_v2') return reply(res, { error: '認証エラー: keyが不正です' })
    if (keys.join(',') !== 'action,idempotency_key,key,messages') {
      return reply(res, { status: 'error', action: 'push_brief_v2', code: 'invalid_request' })
    }
    if (state.mode === 'html') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      return res.end('<html>Google error</html>')
    }
    if (state.mode === 'error_disabled') return reply(res, { status: 'error', action: 'push_brief_v2', code: 'disabled' })
    if (state.mode === 'error_configuration' || state.ownerCount !== 1) {
      return reply(res, { status: 'error', action: 'push_brief_v2', code: 'configuration_error' })
    }

    let messages
    try { messages = JSON.parse(params.messages) } catch {
      return reply(res, { status: 'error', action: 'push_brief_v2', code: 'invalid_request' })
    }
    const valid = /^[A-Za-z0-9._:-]{1,128}$/.test(params.idempotency_key) && Array.isArray(messages) &&
      messages.length >= 1 && messages.length <= 5 &&
      messages.every((m) => m && m.type === 'text' && Object.keys(m).sort().join(',') === 'text,type' &&
        typeof m.text === 'string' && m.text.trim() && m.text.length <= 4500)
    if (!valid) return reply(res, { status: 'error', action: 'push_brief_v2', code: 'invalid_messages' })

    const digest = createHash('sha256').update(JSON.stringify(messages)).digest('hex')
    const receipt = state.receipts.get(params.idempotency_key)
    if (receipt && receipt.digest !== digest) return reply(res, { status: 'error', action: 'push_brief_v2', code: 'idempotency_conflict' })
    if (receipt && receipt.status === 'sent') return reply(res, { status: 'ok', action: 'push_brief_v2', result: 'skipped', messages: messages.length })
    if (receipt) return reply(res, { status: 'uncertain', action: 'push_brief_v2', result: 'uncertain' })

    if (state.mode === 'uncertain') {
      state.receipts.set(params.idempotency_key, { digest, status: 'uncertain' })
      return reply(res, { status: 'uncertain', action: 'push_brief_v2', result: 'uncertain' })
    }
    state.receipts.set(params.idempotency_key, { digest, status: 'sent' })
    state.pushes.push({ to: 'OWNER_FIXED_BY_GAS', idempotencyKey: params.idempotency_key, messages })
    return reply(res, { status: 'ok', action: 'push_brief_v2', result: 'sent', messages: messages.length })
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      if (req.method === 'POST' && url.pathname === '/macros/s/TEST/exec') return handlePost(req, body, res)
      if (req.method === 'GET' && url.pathname === '/macros/echo') {
        const payload = state.echoes.get(url.searchParams.get('user_content_key'))
        res.writeHead(payload ? 200 : 404, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(payload || { error: 'not found' }))
      }
      res.writeHead(404)
      res.end()
    })
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ state, close: () => new Promise((done) => server.close(done)) }))
  })
}
