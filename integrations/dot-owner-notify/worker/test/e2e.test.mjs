// ローカルE2E検証：wrangler dev（本物のWorkerランタイム＋ローカルD1）と模擬GASを立てて、
// dot（ChatGPTコネクタ）と同じ手順で OAuth → MCP → LINE依頼 → 保存 → コックピット取得 を通す。
// 実行: npm test （本番のCloudflare・GAS・LINEには一切つながない）

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { startMockGas } from './mock-gas.mjs'

const WORKER_DIR = fileURLToPath(new URL('..', import.meta.url))
const WORKER_PORT = 18787
const GAS_PORT = 18788
const BASE = `http://127.0.0.1:${WORKER_PORT}`
const REDIRECT_URI = 'http://127.0.0.1:18789/connector/oauth/test-callback'

const secrets = {
  GAS_API_KEY: `gas-${randomBytes(16).toString('hex')}`,
  DOT_CONNECT_CODE: randomBytes(32).toString('base64url'),
  COCKPIT_READ_TOKEN: randomBytes(32).toString('base64url'),
  MCP_STATIC_TOKEN: randomBytes(32).toString('base64url'),
}

// テレメトリ送信を止める（オフライン環境で待たされないように）
const WRANGLER_ENV = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' }
const workDir = mkdtempSync(join(tmpdir(), 'dot-owner-notify-e2e-'))
const persistDir = join(workDir, 'state')
let gas
let worker

function writeEnvFile(overrides = {}) {
  const values = {
    GAS_EXEC_URL: `http://127.0.0.1:${GAS_PORT}/macros/s/TEST/exec`,
    ALLOW_LOCAL_GAS_URL: 'true',
    ...secrets,
    ...overrides,
  }
  const path = join(workDir, 'test.env')
  writeFileSync(path, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 })
  return path
}

async function startWorker(envOverrides = {}, varOverrides = {}) {
  const vars = {
    ALLOWED_REDIRECT_PREFIXES: 'https://chatgpt.com/,http://127.0.0.1:18789/connector/oauth/',
    DAILY_LINE_LIMIT: '50',
    ...varOverrides,
  }
  const args = ['wrangler', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(WORKER_PORT),
    '--persist-to', persistDir, '--env-file', writeEnvFile(envOverrides), '--show-interactive-dev-session=false',
    '--log-level', 'warn']
  for (const [key, value] of Object.entries(vars)) args.push('--var', `${key}:${value}`)
  // npx → wrangler → workerd と子プロセスが増えるので、独立したプロセスグループで起動してまとめて止める。
  const child = spawn('npx', args, { cwd: WORKER_DIR, env: WRANGLER_ENV, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  for (let i = 0; i < 120; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    try {
      const res = await fetch(`${BASE}/health`)
      if (res.ok) return child
    } catch { /* 起動待ち */ }
    if (child.exitCode !== null) break
  }
  killGroup(child)
  throw new Error(`wrangler dev did not start:\n${output.slice(-3000)}`)
}

function killGroup(child) {
  try { process.kill(-child.pid, 'SIGTERM') } catch { /* 既に終了 */ }
  child.stdout.destroy()
  child.stderr.destroy()
}

async function stopWorker() {
  if (!worker) return
  const exited = new Promise((resolve) => worker.once('exit', resolve))
  killGroup(worker)
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))])
  // ポートが空くまで待つ（次の起動が古いWorkerに当たらないように）
  for (let i = 0; i < 40; i++) {
    try { await fetch(`${BASE}/health`) } catch { break }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  worker = null
}

before(async () => {
  if (existsSync(join(WORKER_DIR, '.dev.vars'))) throw new Error('.dev.vars があると --env-file が無視されるため、一時的に退避してください')
  const migrate = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'OWNER_NOTIFY_DB', '--local', '--persist-to', persistDir],
    { cwd: WORKER_DIR, env: WRANGLER_ENV, encoding: 'utf8', timeout: 120000 })
  assert.equal(migrate.status, 0, migrate.stdout + migrate.stderr)
  gas = await startMockGas({ port: GAS_PORT, apiKey: secrets.GAS_API_KEY })
  worker = await startWorker()
})

after(async () => {
  await stopWorker()
  if (gas) await gas.close()
  rmSync(workDir, { recursive: true, force: true })
})

// ---------- 手助け ----------

const pkce = () => {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

async function registerClient(redirectUris = [REDIRECT_URI]) {
  return fetch(`${BASE}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'ChatGPT (test)', redirect_uris: redirectUris, token_endpoint_auth_method: 'none' }),
  })
}

function authorizeParams(clientId, challenge, state = 'st-123') {
  return {
    response_type: 'code', client_id: clientId, redirect_uri: REDIRECT_URI, code_challenge: challenge,
    code_challenge_method: 'S256', state, scope: 'notify', resource: `${BASE}/mcp`,
  }
}

async function approve(params, connectCode) {
  return fetch(`${BASE}/oauth/authorize`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, connect_code: connectCode, decision: 'allow' }).toString(),
  })
}

async function token(form) {
  const res = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  })
  return { status: res.status, body: await res.json() }
}

let rpcId = 0
async function mcp(accessToken, method, params) {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, ...(params ? { params } : {}) }),
  })
  const body = res.status === 202 ? null : await res.json().catch(() => null)
  return { status: res.status, headers: res.headers, body }
}

async function callTool(accessToken, name, args) {
  const res = await mcp(accessToken, 'tools/call', { name, arguments: args })
  assert.equal(res.status, 200)
  return res.body.result
}

async function cockpit(path, tokenValue = secrets.COCKPIT_READ_TOKEN) {
  const res = await fetch(`${BASE}${path}`, { headers: tokenValue ? { Authorization: `Bearer ${tokenValue}` } : {} })
  return { status: res.status, body: await res.json() }
}

const shared = {}

// ---------- 検証 ----------

test('認証なしのMCP呼び出しは401で、ChatGPTがOAuthを始めるための案内ヘッダーを返す', async () => {
  const res = await mcp(null, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } })
  assert.equal(res.status, 401)
  assert.match(res.headers.get('www-authenticate'), /resource_metadata="http:\/\/127\.0\.0\.1:18787\/\.well-known\/oauth-protected-resource"/)
  const wrong = await mcp('dota_invalid-token-value-123456', 'tools/list')
  assert.equal(wrong.status, 401)
  assert.match(wrong.headers.get('www-authenticate'), /error="invalid_token"/)
})

test('OAuthのメタデータを公開している', async () => {
  const prm = await (await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`)).json()
  assert.equal(prm.resource, `${BASE}/mcp`)
  assert.deepEqual(prm.authorization_servers, [BASE])
  const as = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json()
  assert.equal(as.issuer, BASE)
  assert.deepEqual(as.code_challenge_methods_supported, ['S256'])
  assert.equal(as.registration_endpoint, `${BASE}/oauth/register`)
  assert.equal(as.authorization_response_iss_parameter_supported, true)
})

test('許可していない戻り先のクライアント登録は拒否する', async () => {
  const res = await registerClient(['https://evil.example.com/callback'])
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'invalid_redirect_uri')
})

test('接続コードが違うと許可されず、正しいと認可コードが戻り先へ返る', async () => {
  const reg = await registerClient()
  assert.equal(reg.status, 201)
  const client = await reg.json()
  assert.match(client.client_id, /^dotc_/)
  const { verifier, challenge } = pkce()
  const params = authorizeParams(client.client_id, challenge)

  const page = await fetch(`${BASE}/oauth/authorize?${new URLSearchParams(params)}`)
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /本人のAimo公式LINE/)
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/)

  const wrong = await approve(params, 'wrong-code-wrong-code-wrong-code')
  assert.equal(wrong.status, 401)

  const ok = await approve(params, secrets.DOT_CONNECT_CODE)
  assert.equal(ok.status, 302)
  const location = new URL(ok.headers.get('location'))
  assert.equal(`${location.origin}${location.pathname}`, REDIRECT_URI)
  assert.equal(location.searchParams.get('state'), 'st-123')
  assert.equal(location.searchParams.get('iss'), BASE)
  const code = location.searchParams.get('code')
  assert.ok(code)

  const badVerifier = await token({
    grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: client.client_id,
    code_verifier: pkce().verifier, resource: `${BASE}/mcp`,
  })
  assert.equal(badVerifier.body.error, 'invalid_grant')

  const issued = await token({
    grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: client.client_id,
    code_verifier: verifier, resource: `${BASE}/mcp`,
  })
  assert.equal(issued.status, 200, JSON.stringify(issued.body))
  assert.match(issued.body.access_token, /^dota_/)
  assert.match(issued.body.refresh_token, /^dotr_/)
  assert.equal(issued.body.token_type, 'Bearer')

  const reused = await token({
    grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: client.client_id,
    code_verifier: verifier,
  })
  assert.equal(reused.body.error, 'invalid_grant')
  Object.assign(shared, { clientId: client.client_id, access: issued.body.access_token, refresh: issued.body.refresh_token })
})

test('MCPの初期化とツール一覧（4操作のみ）', async () => {
  const init = await mcp(shared.access, 'initialize', {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'chatgpt-test', version: '1' },
  })
  assert.equal(init.status, 200)
  assert.equal(init.body.result.protocolVersion, '2025-06-18')
  assert.match(init.body.result.instructions, /本人1名に固定/)
  const initialized = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${shared.access}` },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  })
  assert.equal(initialized.status, 202)
  const list = await mcp(shared.access, 'tools/list')
  assert.deepEqual(list.body.result.tools.map((tool) => tool.name).sort(),
    ['get_notification', 'get_notify_status', 'list_notifications', 'notify_owner'])
  const notifySchema = list.body.result.tools.find((tool) => tool.name === 'notify_owner').inputSchema
  assert.equal(notifySchema.properties.to, undefined, '宛先を指定する入力は存在しない')
  assert.equal(notifySchema.additionalProperties, false)
})

test('状態確認：GASの本人限定設定（宛先1名）を確認できる', async () => {
  const result = await callTool(shared.access, 'get_notify_status', {})
  assert.equal(result.isError, false)
  assert.equal(result.structuredContent.gas_owner_only.ownerOnlyReady, true)
  assert.equal(result.structuredContent.gas_owner_only.ownerCount, 1)
  assert.equal(JSON.stringify(result).includes(secrets.GAS_API_KEY), false)
})

test('宛先を渡そうとしても受け付けない（入力の項目外）', async () => {
  const pushesBefore = gas.state.pushes.length
  const injected = await callTool(shared.access, 'notify_owner', {
    notification_id: 'test:recipient-injection', title: 't', body: 'b', category: 'other', to: 'U0123456789abcdef0123456789abcdef',
  })
  assert.equal(injected.isError, true)
  assert.equal(injected.structuredContent.error, 'unknown_field')
  assert.equal(gas.state.pushes.length, pushesBefore, '送っていない')

  const result = await callTool(shared.access, 'notify_owner', {
    notification_id: 'test:recipient-injection', title: 't', body: 'b', category: 'other',
  })
  assert.equal(result.isError, false)
  assert.equal(gas.state.pushes.at(-1).to, 'OWNER_FIXED_BY_GAS')
  const calls = gas.state.calls.filter((call) => call.action === 'push_brief_v2')
  assert.ok(calls.every((call) => call.keys.join(',') === 'action,idempotency_key,key,messages'))
  assert.ok(calls.every((call) => call.contentType === 'application/x-www-form-urlencoded'))
  assert.ok(gas.state.calls.every((call) => call.action === 'push_brief_v2' || call.action === 'push_brief_v2_status'),
    '旧 push など他のactionは呼ばない')
})

test('本人通知：送信→同じIDの再呼び出しは再送しない→内容違いは拒否', async () => {
  const args = {
    notification_id: 'morning_check:2026-10-21', title: '朝の確認：返信待ち2件', category: 'morning_check',
    severity: 'important', body: '・A社 見積もりの返信待ち（3日）\n・B社 日程調整の返信待ち（1日）',
  }
  const pushesBefore = gas.state.pushes.length
  const first = await callTool(shared.access, 'notify_owner', args)
  assert.equal(first.isError, false)
  assert.equal(first.structuredContent.delivery, 'sent')
  assert.equal(first.structuredContent.notification.status, 'sent')
  assert.match(first.structuredContent.note, /本人が実際に受信したかは別途確認/)
  assert.equal(gas.state.pushes.length, pushesBefore + 1)
  const pushed = gas.state.pushes.at(-1)
  assert.equal(pushed.idempotencyKey, 'dot:morning_check:2026-10-21')
  assert.match(pushed.messages[0].text, /⚠️【dot｜朝の確認】朝の確認：返信待ち2件/)
  assert.match(pushed.messages[0].text, /ID: morning_check:2026-10-21$/)

  const again = await callTool(shared.access, 'notify_owner', args)
  assert.equal(again.structuredContent.delivery, 'already_sent')
  assert.equal(gas.state.pushes.length, pushesBefore + 1, '二重送信しない')

  const changed = await callTool(shared.access, 'notify_owner', { ...args, body: '別の内容' })
  assert.equal(changed.isError, true)
  assert.equal(changed.structuredContent.error, 'idempotency_conflict')
})

test('GAS側が無効のときは送らずに失敗を記録し、直した後の再呼び出しで送れる', async () => {
  const args = { notification_id: 'missed_item:2026-10-21:invoice', title: '請求書の未送付', body: 'C社の請求書が未送付です。', category: 'missed_item' }
  gas.state.mode = 'error_disabled'
  const failed = await callTool(shared.access, 'notify_owner', args)
  assert.equal(failed.isError, true)
  assert.equal(failed.structuredContent.delivery, 'failed')
  assert.equal(failed.structuredContent.notification.status_detail, 'gas_error_disabled')

  gas.state.mode = 'ok'
  const retried = await callTool(shared.access, 'notify_owner', args)
  assert.equal(retried.structuredContent.delivery, 'sent')
  const detail = await callTool(shared.access, 'get_notification', { notification_id: args.notification_id })
  assert.equal(detail.structuredContent.notification.attempts.length, 2)
  assert.deepEqual(detail.structuredContent.notification.attempts.map((a) => a.outcome), ['failed', 'sent'])
})

test('GASが応答を返さない形（HTMLなど）でも送信済み扱いにせず、再試行できる', async () => {
  const args = { notification_id: 'awaiting_reply:2026-10-21:thread-x', title: '返信待ち', body: 'D社への返信が2日止まっています。', category: 'awaiting_reply' }
  gas.state.mode = 'html'
  const failed = await callTool(shared.access, 'notify_owner', args)
  assert.equal(failed.structuredContent.notification.status_detail, 'gas_invalid_response')
  gas.state.mode = 'ok'
  const retried = await callTool(shared.access, 'notify_owner', args)
  assert.equal(retried.structuredContent.delivery, 'sent')
})

test('LINEの結果が不明なときは自動で再送しない', async () => {
  const args = { notification_id: 'other:2026-10-21:uncertain', title: '不明テスト', body: '結果不明のテスト', category: 'other' }
  gas.state.mode = 'uncertain'
  const first = await callTool(shared.access, 'notify_owner', args)
  assert.equal(first.structuredContent.delivery, 'uncertain')
  gas.state.mode = 'ok'
  const callsBefore = gas.state.calls.length
  const again = await callTool(shared.access, 'notify_owner', args)
  assert.equal(again.structuredContent.delivery, 'uncertain')
  assert.equal(gas.state.calls.length, callsBefore, 'GASにも依頼し直さない')
})

test('保存のみ（deliver_line=false）はLINEへ送らない', async () => {
  const pushesBefore = gas.state.pushes.length
  const result = await callTool(shared.access, 'notify_owner', {
    notification_id: 'other:2026-10-21:save-only', title: '保存のみ', body: 'コックピットだけで見る', category: 'other', deliver_line: false,
  })
  assert.equal(result.structuredContent.delivery, 'not_requested')
  assert.equal(result.structuredContent.notification.status, 'saved_only')
  assert.equal(gas.state.pushes.length, pushesBefore)
})

test('入力チェック：IDの形式・長さ・分類', async () => {
  const badId = await callTool(shared.access, 'notify_owner', { notification_id: 'bad id!', title: 't', body: 'b', category: 'other' })
  assert.equal(badId.structuredContent.error, 'invalid_notification_id')
  const longTitle = await callTool(shared.access, 'notify_owner', { notification_id: 'x:1', title: 'あ'.repeat(81), body: 'b', category: 'other' })
  assert.equal(longTitle.structuredContent.error, 'invalid_title')
  const badCategory = await callTool(shared.access, 'notify_owner', { notification_id: 'x:2', title: 't', body: 'b', category: 'group' })
  assert.equal(badCategory.structuredContent.error, 'invalid_category')
})

test('読み戻し：一覧と1件取得', async () => {
  const list = await callTool(shared.access, 'list_notifications', { limit: 50 })
  const ids = list.structuredContent.notifications.map((n) => n.notification_id)
  assert.ok(ids.includes('morning_check:2026-10-21'))
  assert.ok(ids.includes('other:2026-10-21:save-only'))
  const sentOnly = await callTool(shared.access, 'list_notifications', { status: 'sent' })
  assert.ok(sentOnly.structuredContent.notifications.every((n) => n.status === 'sent'))
  const missing = await callTool(shared.access, 'get_notification', { notification_id: 'nothing:here' })
  assert.equal(missing.structuredContent.found, false)
})

test('コックピット用API：読み取り専用トークンで取得でき、差分取得もできる', async () => {
  assert.equal((await cockpit('/api/notifications', '')).status, 401)
  assert.equal((await cockpit('/api/notifications', shared.access)).status, 401, 'dotのトークンでは読めない')
  const all = await cockpit('/api/notifications?limit=100')
  assert.equal(all.status, 200)
  assert.ok(all.body.notifications.length >= 6)
  const since = await cockpit(`/api/notifications?since=${encodeURIComponent(all.body.server_time)}`)
  assert.equal(since.body.notifications.length, 0)
  const one = await cockpit(`/api/notifications/${encodeURIComponent('morning_check:2026-10-21')}`)
  assert.equal(one.body.notification.status, 'sent')
  assert.equal(one.body.notification.attempts.length, 1)
  const status = await cockpit('/api/status?check_gas=1')
  assert.equal(status.body.gas_owner_only.ownerOnlyReady, true)
  const post = await fetch(`${BASE}/api/notifications`, { method: 'POST', headers: { Authorization: `Bearer ${secrets.COCKPIT_READ_TOKEN}` } })
  assert.equal(post.status, 405, 'コックピットのトークンでは書き込めない')
  const mcpWithCockpit = await mcp(secrets.COCKPIT_READ_TOKEN, 'tools/list')
  assert.equal(mcpWithCockpit.status, 401, 'コックピットのトークンでは通知を送れない')
})

test('コックピットのPythonモジュールで取得・キャッシュでき、トークンはキャッシュに残らない', async () => {
  const cachePath = join(workDir, 'cockpit-cache.json')
  const script = fileURLToPath(new URL('../../cockpit/cloud_notifications.py', import.meta.url))
  const env = { ...process.env, DOT_NOTIFY_BASE_URL: BASE, DOT_NOTIFY_COCKPIT_TOKEN: secrets.COCKPIT_READ_TOKEN, DOT_NOTIFY_CACHE_PATH: cachePath }
  const run = (command) => new Promise((resolve) => {
    const child = spawn('python3', [script, command], { env })
    let out = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { out += chunk })
    child.on('exit', (code) => resolve({ code, out }))
  })
  const first = await run('sync')
  assert.equal(first.code, 0, first.out)
  const summary = JSON.parse(first.out)
  assert.equal(summary.ok, true)
  assert.ok(summary.total >= 6)
  const second = await run('sync')
  assert.equal(JSON.parse(second.out).changed, 0, '2回目は差分なし')
  const listed = await run('list')
  assert.match(listed.out, /LINE送信済み（API受付・本人の受信は未確認）/)
  assert.match(listed.out, /保存のみ（LINE送信なし）/)
  const { readFileSync } = await import('node:fs')
  assert.equal(readFileSync(cachePath, 'utf8').includes(secrets.COCKPIT_READ_TOKEN), false)

  const wrongEnv = { ...env, DOT_NOTIFY_COCKPIT_TOKEN: 'wrong-token-wrong-token-wrong-token' }
  const denied = await new Promise((resolve) => {
    const child = spawn('python3', [script, 'sync'], { env: wrongEnv })
    let out = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.on('exit', (code) => resolve({ code, out }))
  })
  assert.equal(denied.code, 1)
  assert.equal(JSON.parse(denied.out).error, 'unauthorized')
  assert.ok(JSON.parse(denied.out).total >= 6, '失敗してもキャッシュは残る')
})

test('固定トークン（Mac検証用）でもMCPを使え、送信元が direct と記録される', async () => {
  const result = await callTool(secrets.MCP_STATIC_TOKEN, 'notify_owner', {
    notification_id: 'test:direct', title: '直接', body: '固定トークン経由', category: 'other', deliver_line: false,
  })
  assert.equal(result.structuredContent.notification.source, 'direct')
})

test('refresh tokenは入れ替わり、使い回すと同じまとまりのトークンが全部止まる', async () => {
  const rotated = await token({ grant_type: 'refresh_token', refresh_token: shared.refresh, client_id: shared.clientId })
  assert.equal(rotated.status, 200)
  assert.notEqual(rotated.body.refresh_token, shared.refresh)
  assert.equal((await mcp(rotated.body.access_token, 'tools/list')).status, 200)

  const reuse = await token({ grant_type: 'refresh_token', refresh_token: shared.refresh, client_id: shared.clientId })
  assert.equal(reuse.body.error, 'invalid_grant')
  assert.equal((await mcp(rotated.body.access_token, 'tools/list')).status, 401, '使い回し検知で一括失効')
  const next = await token({ grant_type: 'refresh_token', refresh_token: rotated.body.refresh_token, client_id: shared.clientId })
  assert.equal(next.body.error, 'invalid_grant')
})

test('宛先が1名でない設定ならGASが拒否し、状態確認でも使えないと分かる', async () => {
  gas.state.ownerCount = 2
  const status = await callTool(secrets.MCP_STATIC_TOKEN, 'get_notify_status', {})
  assert.equal(status.structuredContent.gas_owner_only.ownerOnlyReady, false)
  const result = await callTool(secrets.MCP_STATIC_TOKEN, 'notify_owner', {
    notification_id: 'test:two-owners', title: '2名', body: '送られてはいけない', category: 'other',
  })
  assert.equal(result.structuredContent.delivery, 'failed')
  assert.equal(result.structuredContent.notification.status_detail, 'gas_error_configuration_error')
  gas.state.ownerCount = 1
})

test('接続コードを入れ替えると、発行済みのdot用トークンは全部無効になる', async () => {
  const reg = await (await registerClient()).json()
  const { verifier, challenge } = pkce()
  const params = authorizeParams(reg.client_id, challenge, 'st-rotate')
  const code = new URL((await approve(params, secrets.DOT_CONNECT_CODE)).headers.get('location')).searchParams.get('code')
  const issued = await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: reg.client_id, code_verifier: verifier })
  assert.equal((await mcp(issued.body.access_token, 'tools/list')).status, 200)

  await stopWorker()
  worker = await startWorker({ DOT_CONNECT_CODE: randomBytes(32).toString('base64url') })
  assert.equal((await mcp(issued.body.access_token, 'tools/list')).status, 401)
  const refreshed = await token({ grant_type: 'refresh_token', refresh_token: issued.body.refresh_token, client_id: reg.client_id })
  assert.equal(refreshed.body.error, 'invalid_grant')
})

test('1日の送信上限に達したら送らない／GASのURLが本番形式でなければ送らない', async () => {
  await stopWorker()
  worker = await startWorker({}, { DAILY_LINE_LIMIT: '1' })
  const limited = await callTool(secrets.MCP_STATIC_TOKEN, 'notify_owner', {
    notification_id: 'test:limit', title: '上限', body: '上限テスト', category: 'other',
  })
  assert.equal(limited.structuredContent.notification.status_detail, 'daily_limit_reached')

  await stopWorker()
  worker = await startWorker({ ALLOW_LOCAL_GAS_URL: 'false' })
  const notConfigured = await callTool(secrets.MCP_STATIC_TOKEN, 'notify_owner', {
    notification_id: 'test:not-configured', title: '未設定', body: '本番形式でないURL', category: 'other',
  })
  assert.equal(notConfigured.structuredContent.notification.status_detail, 'relay_not_configured')
})
