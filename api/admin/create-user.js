// Vercel Serverless Function: 管理者が新規店舗ユーザーを作成する。
// 既存ユーザーのパスワードはこのAPIからは変更しない。

import {
  BrowserSessionError,
  authenticateBoundRequest,
  requireAdmin,
} from '../_lib/browser-session.js'
import { enforceSameOriginJson } from '../_lib/request-security.js'
import { isValidAccountPasswordLength } from '../../src/lib/accountPassword.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

class AccountProvisionError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function sb(path, init = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SECRET,
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
}

export function normalizeAccountRequest(input = {}) {
  const email = String(input.email || '').trim().toLowerCase()
  const storeId = String(input.storeId || '').trim()
  const password = typeof input.password === 'string' ? input.password : ''

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new Error('有効なメールアドレスを入力してください')
  }
  if (!UUID_PATTERN.test(storeId)) throw new Error('店舗IDが正しくありません')
  if (!isValidAccountPasswordLength(password)) {
    throw new Error('パスワードは8文字以上かつUTF-8で72バイト以下にしてください')
  }
  return { email, password, storeId }
}

export async function provisionStoreUser({ email, password, storeId }, request = sb) {
  const createRes = await request('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  if (!createRes.ok) {
    const detail = await createRes.text()
    const payload = (() => {
      try { return JSON.parse(detail) } catch { return {} }
    })()
    const errorCode = String(
      payload?.error_code || (typeof payload?.code === 'string' ? payload.code : ''),
    ).toLowerCase()
    const errorMessage = String(payload?.message || payload?.msg || payload?.error_description || detail)
    const isDuplicate = ['email_exists', 'user_already_exists'].includes(errorCode)
      || /already[^\n]*(registered|exist)/i.test(errorMessage)
    if (isDuplicate) {
      throw new AccountProvisionError(409, 'このメールは登録済みです。別のメールアドレスを使用してください')
    }
    const isPasswordError = errorCode === 'weak_password'
      || (errorCode === 'validation_failed' && /password/i.test(errorMessage))
      || /password/i.test(errorMessage)
    if (isPasswordError) {
      throw new AccountProvisionError(400, '認証サービスのパスワード要件を満たしていません。8文字以上で別のパスワードを入力してください')
    }
    if (createRes.status === 400 || createRes.status === 422) {
      throw new AccountProvisionError(400, '入力内容が認証サービスの要件を満たしていません。メールアドレスとパスワードを確認してください')
    }
    console.error('Supabase user creation failed:', createRes.status, detail.slice(0, 200))
    throw new AccountProvisionError(502, 'ユーザー作成に失敗しました')
  }

  const created = await createRes.json().catch(() => null)
  const userId = String(created?.id || '')
  if (!UUID_PATTERN.test(userId)) {
    console.error('Supabase user creation returned an invalid user id')
    throw new AccountProvisionError(502, 'ユーザー作成に失敗しました')
  }

  const memberRes = await request('/rest/v1/store_members', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ store_id: storeId, user_id: userId }),
  })
  if (!memberRes.ok) {
    const detail = await memberRes.text()
    console.error('Supabase member insert failed:', memberRes.status, detail.slice(0, 200))
    try {
      const cleanup = await request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
      if (!cleanup.ok) {
        console.error('Supabase orphan user cleanup failed:', cleanup.status, (await cleanup.text()).slice(0, 200))
      }
    } catch (error) {
      console.error('Supabase orphan user cleanup failed:', error?.message || 'unknown')
    }
    throw new AccountProvisionError(502, '店舗メンバーの追加に失敗しました。アカウント作成を取り消しました')
  }

  return { userId }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return }
  if (!enforceSameOriginJson(req, res)) return
  if (!SUPABASE_URL || !SECRET) { res.status(500).json({ error: 'server not configured' }); return }

  try {
    const auth = await authenticateBoundRequest(req, res)
    await requireAdmin(auth)

    let account
    try { account = normalizeAccountRequest(req.body) } catch (error) {
      res.status(400).json({ error: error.message }); return
    }
    const { userId } = await provisionStoreUser(account)
    res.status(200).json({ ok: true, userId })
  } catch (error) {
    if (error instanceof BrowserSessionError) {
      const messages = {
        UNAUTHENTICATED: '認証が必要です',
        BROWSER_LOCKED: 'このアカウントは別のブラウザに固定されています',
        ADMIN_REQUIRED: '管理者のみ実行できます',
      }
      res.status(error.status).json({ error: messages[error.code] || '認証を確認できません', code: error.code })
      return
    }
    if (error instanceof AccountProvisionError) {
      res.status(error.status).json({ error: error.message })
      return
    }
    console.error('Create user API error:', error?.message || 'unknown')
    res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}
