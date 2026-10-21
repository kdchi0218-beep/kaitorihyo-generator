// 通知の保存・重複防止・送信結果の記録。
// 1つの notification_id につきLINEへの依頼は「成功が確認されるまで」だけ行い、
// 成功済み・結果不明のものは何度呼ばれても再送しない（結果不明は二重送信を避けるため人が確認する）。

import { deliverViaGas, gasConfigured } from './gas.js'
import { cleanText, intVar, isoBeforeSeconds, jstDayStartIso, nowIso, oneLine, sha256Hex } from './util.js'

export const CATEGORIES = ['morning_check', 'missed_item', 'awaiting_reply', 'other']
export const SEVERITIES = ['info', 'important', 'urgent']
export const STATUSES = ['saved_only', 'stored', 'sending', 'sent', 'uncertain', 'failed']

const NOTIFICATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/
const TITLE_MAX = 80
const BODY_MAX = 3500
// 送信中のまま止まった記録（Workerの中断など）は、この秒数を過ぎたら再試行を許す。
// GAS側の受領記録があるので、実際に送れていた場合は再送されずにスキップされる。
const STALE_SENDING_SECONDS = 120

const CATEGORY_LABELS = {
  morning_check: '朝の確認',
  missed_item: '見落とし',
  awaiting_reply: '返信待ち',
  other: 'お知らせ',
}
const SEVERITY_ICONS = { info: '🔔', important: '⚠️', urgent: '🚨' }

export class InputError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const NOTIFY_INPUT_KEYS = ['notification_id', 'title', 'body', 'category', 'severity', 'deliver_line']

export function validateNotifyInput(args) {
  const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
  // 宛先（to など）を含む想定外の項目は、無視せずはっきり拒否する。
  const unknown = Object.keys(input).filter((key) => !NOTIFY_INPUT_KEYS.includes(key))
  if (unknown.length) {
    throw new InputError('unknown_field', `使えない項目があります: ${unknown.join(', ')}（宛先は本人に固定のため指定できません）`)
  }
  const id = typeof input.notification_id === 'string' ? input.notification_id.trim() : ''
  if (!NOTIFICATION_ID_PATTERN.test(id)) {
    throw new InputError('invalid_notification_id', 'notification_id は英数字と . _ : - の1〜100文字で指定してください。')
  }
  const title = oneLine(input.title)
  if (!title || title.length > TITLE_MAX) throw new InputError('invalid_title', `title は1〜${TITLE_MAX}文字で指定してください。`)
  const body = cleanText(input.body)
  if (!body || body.length > BODY_MAX) throw new InputError('invalid_body', `body は1〜${BODY_MAX}文字で指定してください。`)
  const category = input.category ?? 'other'
  if (!CATEGORIES.includes(category)) throw new InputError('invalid_category', `category は ${CATEGORIES.join(' / ')} のいずれかです。`)
  const severity = input.severity ?? 'info'
  if (!SEVERITIES.includes(severity)) throw new InputError('invalid_severity', `severity は ${SEVERITIES.join(' / ')} のいずれかです。`)
  const deliverLine = input.deliver_line === undefined ? true : input.deliver_line
  if (typeof deliverLine !== 'boolean') throw new InputError('invalid_deliver_line', 'deliver_line は true か false です。')
  return { id, title, body, category, severity, deliverLine }
}

export function formatLineText(row) {
  const icon = SEVERITY_ICONS[row.severity] || SEVERITY_ICONS.info
  const label = CATEGORY_LABELS[row.category] || CATEGORY_LABELS.other
  return `${icon}【dot｜${label}】${row.title}\n\n${row.body}\n\nID: ${row.id}`
}

export function publicNotification(row) {
  if (!row) return null
  return {
    notification_id: row.id,
    source: row.source,
    category: row.category,
    severity: row.severity,
    title: row.title,
    body: row.body,
    deliver_line: row.deliver_line === 1,
    status: row.status,
    status_detail: row.status_detail || null,
    attempt_count: row.attempt_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sent_at: row.sent_at || null,
  }
}

async function loadRow(db, id) {
  return db.prepare('SELECT * FROM notifications WHERE id = ?').bind(id).first()
}

async function attemptsToday(db) {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM delivery_attempts WHERE started_at >= ?')
    .bind(jstDayStartIso()).first()
  return Number(row?.count || 0)
}

// 通知を保存し、必要ならLINEへ送る。戻り値は MCP / API でそのまま返せる形。
export async function notifyOwner(env, rawArgs, source) {
  const db = env.OWNER_NOTIFY_DB
  const input = validateNotifyInput(rawArgs)
  const contentHash = await sha256Hex(JSON.stringify([
    input.category, input.severity, input.title, input.body, input.deliverLine,
  ]))
  const now = nowIso()

  await db.prepare(`INSERT INTO notifications
      (id, content_hash, source, category, severity, title, body, deliver_line, status, attempt_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(id) DO NOTHING`)
    .bind(input.id, contentHash, source, input.category, input.severity, input.title, input.body,
      input.deliverLine ? 1 : 0, input.deliverLine ? 'stored' : 'saved_only', now, now)
    .run()

  let row = await loadRow(db, input.id)
  if (!row) throw new Error('store_failed')
  if (row.content_hash !== contentHash) {
    throw new InputError('idempotency_conflict',
      '同じ notification_id で内容の違う通知が既に保存されています。別の通知なら別のIDを使ってください。')
  }

  if (!row.deliver_line) return deliveryResult(row, 'not_requested')
  if (row.status === 'sent') return deliveryResult(row, 'already_sent')
  if (row.status === 'uncertain') return deliveryResult(row, 'uncertain')
  if (row.status === 'sending' && row.updated_at > isoBeforeSeconds(STALE_SENDING_SECONDS)) {
    return deliveryResult(row, 'in_progress')
  }

  if (!gasConfigured(env)) {
    await finish(db, row.id, 'failed', 'relay_not_configured', null)
    return deliveryResult(await loadRow(db, row.id), 'failed')
  }
  const dailyLimit = intVar(env.DAILY_LINE_LIMIT, 20, 1, 500)
  if (await attemptsToday(db) >= dailyLimit) {
    await finish(db, row.id, 'failed', 'daily_limit_reached', null)
    return deliveryResult(await loadRow(db, row.id), 'failed')
  }

  // 送信の権利を1つの呼び出しだけが取る（同時に呼ばれても依頼は1回）。
  const claimedAt = nowIso()
  const claim = await db.prepare(`UPDATE notifications
      SET status = 'sending', status_detail = NULL, attempt_count = attempt_count + 1, updated_at = ?
      WHERE id = ? AND (status IN ('stored', 'failed') OR (status = 'sending' AND updated_at <= ?))`)
    .bind(claimedAt, row.id, isoBeforeSeconds(STALE_SENDING_SECONDS))
    .run()
  if (!claim.meta || claim.meta.changes !== 1) {
    row = await loadRow(db, row.id)
    return deliveryResult(row, row.status === 'sending' ? 'in_progress' : row.status)
  }

  const attempt = await db.prepare(`INSERT INTO delivery_attempts (notification_id, started_at, outcome)
      VALUES (?, ?, 'sending')`).bind(row.id, claimedAt).run()
  const attemptId = attempt.meta?.last_row_id

  // GAS側の idempotency_key は通知IDから決まるので、再試行してもLINEには1回しか届かない。
  const delivery = await deliverViaGas(env, `dot:${row.id}`, formatLineText(row))
  const finishedAt = nowIso()
  if (attemptId) {
    await db.prepare(`UPDATE delivery_attempts
        SET finished_at = ?, outcome = ?, detail = ?, gas_status = ?, gas_result = ?, gas_code = ?, http_status = ?
        WHERE id = ?`)
      .bind(finishedAt, delivery.outcome, delivery.detail, delivery.gasStatus || null, delivery.gasResult || null,
        delivery.gasCode || null, delivery.httpStatus || null, attemptId)
      .run()
  }
  const status = delivery.outcome === 'already_sent' ? 'sent' : delivery.outcome
  await finish(db, row.id, status, delivery.detail, status === 'sent' ? finishedAt : null)
  return deliveryResult(await loadRow(db, row.id), delivery.outcome)
}

async function finish(db, id, status, detail, sentAt) {
  await db.prepare(`UPDATE notifications
      SET status = ?, status_detail = ?, updated_at = ?, sent_at = COALESCE(?, sent_at)
      WHERE id = ?`)
    .bind(status, detail, nowIso(), sentAt, id)
    .run()
}

const DELIVERY_NOTES = {
  sent: 'LINE APIが受け付けました（GAS経由・本人1名宛て）。本人が実際に受信したかは別途確認が必要です。',
  already_sent: 'この通知IDは既に送信済みのため、再送していません。',
  uncertain: 'LINE APIの結果が不明です。二重送信を避けるため自動では再送しません。本人のLINEで届いたか確認してください。',
  in_progress: '同じ通知IDの送信が処理中です。少し待ってから get_notification で結果を確認してください。',
  not_requested: 'LINE送信なしで保存だけしました（コックピットで表示されます）。',
  failed: 'LINEへは送っていません。原因を直したあと、同じ notification_id・同じ内容でもう一度呼ぶと再試行します。',
}

function deliveryResult(row, delivery) {
  return {
    saved: true,
    delivery,
    note: DELIVERY_NOTES[delivery] || '',
    notification: publicNotification(row),
  }
}

export async function getNotification(env, id, includeAttempts = true) {
  const db = env.OWNER_NOTIFY_DB
  if (typeof id !== 'string' || !NOTIFICATION_ID_PATTERN.test(id)) {
    throw new InputError('invalid_notification_id', 'notification_id の形式が正しくありません。')
  }
  const row = await loadRow(db, id)
  if (!row) return null
  const result = publicNotification(row)
  if (includeAttempts) {
    const { results } = await db.prepare(`SELECT started_at, finished_at, outcome, detail, gas_status, gas_result, gas_code, http_status
        FROM delivery_attempts WHERE notification_id = ? ORDER BY id ASC LIMIT 20`).bind(id).all()
    result.attempts = results || []
  }
  return result
}

export async function listNotifications(env, { limit = 20, updatedSince = null, status = null } = {}) {
  const db = env.OWNER_NOTIFY_DB
  const safeLimit = intVar(limit, 20, 1, 500)
  const conditions = []
  const binds = []
  if (updatedSince) {
    const parsed = new Date(updatedSince)
    if (Number.isNaN(parsed.getTime())) throw new InputError('invalid_since', 'since は ISO 8601 の日時で指定してください。')
    conditions.push('updated_at >= ?')
    binds.push(parsed.toISOString())
  }
  if (status) {
    if (!STATUSES.includes(status)) throw new InputError('invalid_status', `status は ${STATUSES.join(' / ')} のいずれかです。`)
    conditions.push('status = ?')
    binds.push(status)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  // since 指定時は古い順（コックピットの差分取得用）、未指定時は新しい順（一覧表示用）。
  const order = updatedSince ? 'ORDER BY updated_at ASC, id ASC' : 'ORDER BY created_at DESC, id DESC'
  const { results } = await db.prepare(`SELECT * FROM notifications ${where} ${order} LIMIT ?`)
    .bind(...binds, safeLimit + 1).all()
  const rows = results || []
  return {
    notifications: rows.slice(0, safeLimit).map(publicNotification),
    has_more: rows.length > safeLimit,
  }
}

export async function relaySummary(env) {
  const db = env.OWNER_NOTIFY_DB
  const { results } = await db.prepare(`SELECT status, COUNT(*) AS count FROM notifications
      WHERE created_at >= ? GROUP BY status`).bind(isoBeforeSeconds(7 * 24 * 60 * 60)).all()
  const lastSent = await db.prepare('SELECT MAX(sent_at) AS sent_at FROM notifications').first()
  const countsLast7Days = {}
  for (const row of results || []) countsLast7Days[row.status] = Number(row.count)
  return {
    counts_last_7_days: countsLast7Days,
    last_sent_at: lastSent?.sent_at || null,
    line_attempts_today: await attemptsToday(db),
    daily_line_limit: intVar(env.DAILY_LINE_LIMIT, 20, 1, 500),
  }
}
