// MCP（Streamable HTTP、JSONで応答・SSEなし・セッションなし）。
// dot が使う操作は4つだけ：本人通知、状態確認、一覧の読み戻し、1件の詳細。

import { gasConfigured, gasOwnerStatus } from './gas.js'
import {
  CATEGORIES, InputError, SEVERITIES, STATUSES, getNotification, listNotifications, notifyOwner, relaySummary,
} from './notify.js'
import { oauthEnabled } from './oauth.js'
import { SECURITY_HEADERS, json } from './util.js'

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const SERVER_INFO = { name: 'aimo-owner-notify', title: 'Aimo本人通知（dot用）', version: '1.0.0' }

const INSTRUCTIONS = [
  'このサーバーは、dotの能動チェック（朝の確認・見落とし・返信待ちなど）の結果を、オーナー本人のAimo公式LINEへ届け、KAI COCKPIT用に保存します。',
  '宛先は本人1名に固定されていて変更できません。他者やグループには送れません。',
  'notify_owner の notification_id は「チェックの種類:日付:対象」のように決定的に作ってください（例: morning_check:2026-10-21 / awaiting_reply:2026-10-21:thread-abc）。',
  '同じIDで呼び直しても二重送信されません。内容を変えて送り直す場合は別のIDにしてください。',
  'delivery が sent でも「LINE APIが受け付けた」だけで、本人の受信確認ではありません。uncertain のときは再送せず、本人に確認してもらってください。',
  'パスワードやトークンなどの秘密情報、他人の個人情報の全文は本文に含めないでください。',
].join('\n')

const TOOLS = [
  {
    name: 'notify_owner',
    title: '本人へLINE通知（保存つき）',
    description: 'dotのチェック結果を、オーナー本人のAimo公式LINEへ送り、同じ内容をクラウドに保存します（KAI COCKPITでも表示）。宛先は本人に固定。同じ notification_id での再呼び出しは二重送信されません。',
    inputSchema: {
      type: 'object',
      properties: {
        notification_id: {
          type: 'string', pattern: '^[A-Za-z0-9._:-]{1,100}$',
          description: '重複防止用の通知ID。例: morning_check:2026-10-21',
        },
        title: { type: 'string', minLength: 1, maxLength: 80, description: '1行の見出し' },
        body: { type: 'string', minLength: 1, maxLength: 3500, description: '本文（改行可）' },
        category: { type: 'string', enum: CATEGORIES, description: 'morning_check=朝の確認 / missed_item=見落とし / awaiting_reply=返信待ち / other=その他' },
        severity: { type: 'string', enum: SEVERITIES, default: 'info', description: 'info / important / urgent' },
        deliver_line: { type: 'boolean', default: true, description: 'false なら保存のみ（LINEへは送らない）' },
      },
      required: ['notification_id', 'title', 'body', 'category'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'get_notify_status',
    title: '通知経路の状態確認',
    description: '通知の中継が使える状態か（GASの本人限定設定・宛先が1名か・LINEトークン有無）と、直近の送信件数を返します。宛先IDやトークンの値は返しません。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'list_notifications',
    title: '保存した通知の一覧',
    description: '保存済みの通知を新しい順に返します（since を指定すると、その日時以降に更新されたものを古い順に返します）。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        since: { type: 'string', format: 'date-time', description: 'この日時以降に更新された通知（ISO 8601）' },
        status: { type: 'string', enum: STATUSES },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'get_notification',
    title: '通知1件の詳細',
    description: '通知1件の保存内容と、LINE送信の試行記録を返します。',
    inputSchema: {
      type: 'object',
      properties: { notification_id: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,100}$' } },
      required: ['notification_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
]

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

function toolResult(structured, summary, isError = false) {
  return {
    content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(structured, null, 2)}` }],
    structuredContent: structured,
    isError,
  }
}

function deliverySummary(result) {
  const labels = {
    sent: 'LINEへ送信しました（API受付済み・本人の受信は未確認）',
    already_sent: '送信済みのため再送しませんでした',
    uncertain: '送信結果が不明です（再送しません）',
    in_progress: '同じIDの送信が処理中です',
    not_requested: '保存のみ行いました',
    failed: 'LINEへは送っていません',
  }
  return `${labels[result.delivery] || result.delivery}：${result.notification?.notification_id || ''}`
}

async function callTool(env, name, args, auth) {
  try {
    if (name === 'notify_owner') {
      const result = await notifyOwner(env, args, auth.source)
      return toolResult(result, deliverySummary(result), result.delivery === 'failed')
    }
    if (name === 'get_notify_status') {
      const status = {
        relay: {
          gas_configured: gasConfigured(env),
          oauth_enabled: oauthEnabled(env),
          cockpit_read_enabled: String(env.COCKPIT_READ_TOKEN || '').trim().length >= 24,
        },
        gas_owner_only: gasConfigured(env) ? await gasOwnerStatus(env) : { reachable: false, error: 'relay_not_configured' },
        ...(await relaySummary(env)),
      }
      const ready = status.gas_owner_only.ownerOnlyReady === true
      const summary = ready
        ? '本人限定の通知経路は使える状態です（宛先1名・GAS設定済み）。'
        : '本人限定の通知経路はまだ使えません。gas_owner_only を確認してください。'
      return toolResult(status, summary)
    }
    if (name === 'list_notifications') {
      const input = args && typeof args === 'object' ? args : {}
      const result = await listNotifications(env, {
        limit: Math.min(Number(input.limit || 20), 50),
        updatedSince: input.since || null,
        status: input.status || null,
      })
      return toolResult(result, `${result.notifications.length}件を返します。`)
    }
    if (name === 'get_notification') {
      const id = args && typeof args === 'object' ? args.notification_id : ''
      const notification = await getNotification(env, id)
      if (!notification) return toolResult({ found: false, notification_id: id }, 'その通知IDは保存されていません。', true)
      return toolResult({ found: true, notification }, `状態: ${notification.status}`)
    }
    return null
  } catch (error) {
    if (error instanceof InputError) return toolResult({ error: error.code, message: error.message }, error.message, true)
    console.error('tool_failed', name, error && error.message)
    return toolResult({ error: 'internal_error' }, '内部エラーが発生しました。少し待ってから再試行してください。', true)
  }
}

async function handleMessage(env, message, auth) {
  if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return rpcError(message && message.id, -32600, 'Invalid Request')
  }
  const isNotification = !Object.prototype.hasOwnProperty.call(message, 'id')
  if (isNotification) return null

  const { id, method } = message
  const params = message.params && typeof message.params === 'object' ? message.params : {}
  switch (method) {
    case 'initialize': {
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0]
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS })
    case 'tools/call': {
      const result = await callTool(env, params.name, params.arguments, auth)
      if (!result) return rpcError(id, -32602, `Unknown tool: ${String(params.name || '')}`)
      return rpcResult(id, result)
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`)
  }
}

export async function handleMcp(request, env, auth) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return json(rpcError(null, -32700, 'Parse error'), 400)
  }
  const messages = Array.isArray(payload) ? payload : [payload]
  if (!messages.length || messages.length > 20) return json(rpcError(null, -32600, 'Invalid Request'), 400)

  const responses = []
  for (const message of messages) {
    const response = await handleMessage(env, message, auth)
    if (response) responses.push(response)
  }
  if (!responses.length) return new Response(null, { status: 202, headers: SECURITY_HEADERS })
  return json(Array.isArray(payload) ? responses : responses[0])
}
