// 既存GAS（AI秘書公式LINE）の本人限定API push_brief_v2 だけを呼ぶ。
// 宛先はGAS側の MORNING_BRIEF_V2_OWNER_LINE_USER_ID に固定されていて、ここからは指定できない。
// 旧 action=push（複数オーナーに届く可能性あり）は呼べないよう、actionを下の2つに限定している。

const ALLOWED_ACTIONS = new Set(['push_brief_v2', 'push_brief_v2_status'])
const GAS_EXEC_URL_PATTERN = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/
const LOCAL_TEST_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d{2,5}\/[A-Za-z0-9_\/-]*$/
const GAS_TIMEOUT_MS = 25000

export function gasConfigured(env) {
  return Boolean(gasExecUrl(env) && String(env.GAS_API_KEY || '').trim())
}

function gasExecUrl(env) {
  const url = String(env.GAS_EXEC_URL || '').trim()
  if (GAS_EXEC_URL_PATTERN.test(url)) return url
  // ローカル検証（模擬GAS）用。本番の wrangler.toml / secret には ALLOW_LOCAL_GAS_URL を入れない。
  if (env.ALLOW_LOCAL_GAS_URL === 'true' && LOCAL_TEST_URL_PATTERN.test(url)) return url
  return ''
}

// 戻り値: { transport: 'ok'|'not_configured'|'network_error'|'timeout'|'invalid_response', httpStatus, data }
async function callGas(env, action, extraParams = {}) {
  if (!ALLOWED_ACTIONS.has(action)) throw new Error('gas_action_not_allowed')
  const url = gasExecUrl(env)
  const key = String(env.GAS_API_KEY || '').trim()
  if (!url || !key) return { transport: 'not_configured', httpStatus: 0, data: null }

  // GAS側は受け取るキーの組み合わせを厳密に確認するため、余計なキーは送らない。
  const body = new URLSearchParams({ action, key, ...extraParams }).toString()
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      // GASは postData.type が完全一致で application/x-www-form-urlencoded のときだけ本人限定APIに通す。
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'follow',
      signal: AbortSignal.timeout(GAS_TIMEOUT_MS),
    })
  } catch (error) {
    const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return { transport: timedOut ? 'timeout' : 'network_error', httpStatus: 0, data: null }
  }
  const raw = await response.text().catch(() => '')
  try {
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not_object')
    return { transport: 'ok', httpStatus: response.status, data }
  } catch {
    return { transport: 'invalid_response', httpStatus: response.status, data: null }
  }
}

function safeCode(value) {
  const textValue = String(value ?? '')
  return /^[a-z0-9_]{1,64}$/.test(textValue) ? textValue : (textValue ? 'unknown_code' : '')
}

// LINEへの送信をGASに依頼する。結果は次のどれかに正規化する。
//   sent        : GASがLINE APIの成功を確認（本人の受信確認ではない）
//   already_sent: 同じ idempotency_key で既に送信済み（GASの受領記録でスキップ）
//   uncertain   : GASがLINE APIを呼んだが結果不明（重複を避けるため再送しない）
//   failed      : 送信前に止まった（設定不備・認証エラー・通信失敗など。GASの受領記録が重複を防ぐので再試行してよい）
export async function deliverViaGas(env, idempotencyKey, messageText) {
  const result = await callGas(env, 'push_brief_v2', {
    idempotency_key: idempotencyKey,
    messages: JSON.stringify([{ type: 'text', text: messageText }]),
  })
  const base = { httpStatus: result.httpStatus, gasStatus: '', gasResult: '', gasCode: '' }
  if (result.transport !== 'ok') return { ...base, outcome: 'failed', detail: `gas_${result.transport}` }

  const data = result.data
  const gasStatus = safeCode(data.status)
  const gasResult = safeCode(data.result)
  const gasCode = safeCode(data.code)
  const summary = { ...base, gasStatus, gasResult, gasCode }
  if (gasStatus === 'ok' && gasResult === 'sent') return { ...summary, outcome: 'sent', detail: 'line_api_accepted' }
  if (gasStatus === 'ok' && gasResult === 'skipped') return { ...summary, outcome: 'already_sent', detail: 'gas_receipt_already_sent' }
  if (gasStatus === 'uncertain') return { ...summary, outcome: 'uncertain', detail: 'gas_line_result_uncertain' }
  if (gasStatus === 'error') return { ...summary, outcome: 'failed', detail: `gas_error_${gasCode || 'unknown'}` }
  // 旧doGetの認証エラー形式など、想定外の応答は送信していない扱い（GASの受領記録が再送の重複を防ぐ）。
  return { ...summary, outcome: 'failed', detail: 'gas_unexpected_response' }
}

// GAS側の本人限定設定を確認する。宛先IDやトークンの値は返さない（件数と真偽値だけ）。
export async function gasOwnerStatus(env) {
  const result = await callGas(env, 'push_brief_v2_status')
  if (result.transport !== 'ok') return { reachable: false, error: `gas_${result.transport}` }
  const data = result.data
  if (data.status !== 'ok' || !data.result || typeof data.result !== 'object') {
    return { reachable: true, error: `gas_error_${safeCode(data.code) || 'unexpected_response'}` }
  }
  const ownerCount = Number.isInteger(data.result.ownerCount) ? data.result.ownerCount : null
  const configReady = data.result.configReady === true
  return {
    reachable: true,
    ownerCount,
    configReady,
    tokenPresent: data.result.tokenPresent === true,
    ownerOnlyReady: configReady && ownerCount === 1,
  }
}
