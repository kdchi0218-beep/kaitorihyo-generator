// Vercel Serverless Function: 管理者が新規店舗ユーザーを作成する。
// 既存ユーザーのパスワードはこのAPIからは変更しない。

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  const inviteMode = input.invite === true || password.length === 0

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new Error('有効なメールアドレスを入力してください')
  }
  if (!UUID_PATTERN.test(storeId)) throw new Error('店舗IDが正しくありません')
  if (!inviteMode && (password.length < 12 || password.length > 128)) {
    throw new Error('パスワードは12〜128文字で入力してください')
  }
  return { email, password, storeId, inviteMode }
}

async function findUserByEmail(email) {
  const perPage = 200
  for (let page = 1; page <= 50; page += 1) {
    const listRes = await sb(`/auth/v1/admin/users?page=${page}&per_page=${perPage}`)
    if (!listRes.ok) throw new Error('既存ユーザーの取得に失敗しました')
    const list = await listRes.json()
    const users = Array.isArray(list) ? list : (list.users || [])
    const found = users.find(user => String(user.email || '').toLowerCase() === email)
    if (found) return found
    if (users.length < perPage) return null
  }
  throw new Error('既存ユーザーの検索上限を超えました')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return }
  if (!SUPABASE_URL || !SECRET) { res.status(500).json({ error: 'server not configured' }); return }

  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) { res.status(401).json({ error: '認証が必要です' }); return }

    const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SECRET, Authorization: `Bearer ${token}` },
    })
    if (!meRes.ok) { res.status(401).json({ error: 'セッションが無効です' }); return }
    const me = await meRes.json()

    const adminRes = await sb(`/rest/v1/app_admins?select=user_id&user_id=eq.${me.id}`)
    if (!adminRes.ok) { res.status(502).json({ error: '管理者権限を確認できません' }); return }
    const admins = await adminRes.json()
    if (!Array.isArray(admins) || admins.length === 0) {
      res.status(403).json({ error: '管理者のみ実行できます' }); return
    }

    let account
    try { account = normalizeAccountRequest(req.body) } catch (error) {
      res.status(400).json({ error: error.message }); return
    }
    const { email, password, storeId, inviteMode } = account

    let userId = null
    if (inviteMode) {
      const inviteRes = await sb('/auth/v1/invite', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      if (inviteRes.ok) {
        userId = (await inviteRes.json()).id
      } else {
        const detail = await inviteRes.text()
        if (inviteRes.status === 422 || /already|exist|registered/i.test(detail)) {
          const found = await findUserByEmail(email)
          if (!found) {
            res.status(409).json({ error: 'このメールは登録済みですが、ユーザー情報を確認できません' }); return
          }
          userId = found.id
        } else {
          console.error('Supabase invite failed:', inviteRes.status, detail.slice(0, 200))
          res.status(502).json({ error: '招待メールの送信に失敗しました' }); return
        }
      }
    } else {
      const createRes = await sb('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, password, email_confirm: true }),
      })
      if (createRes.ok) {
        userId = (await createRes.json()).id
      } else {
        const detail = await createRes.text()
        if (createRes.status === 422 || /exist/i.test(detail)) {
          res.status(409).json({
            error: 'このメールは登録済みです。既存ユーザーを店舗に追加する場合は招待方式を使ってください',
          }); return
        }
        console.error('Supabase user creation failed:', createRes.status, detail.slice(0, 200))
        res.status(502).json({ error: 'ユーザー作成に失敗しました' }); return
      }
    }

    const memberRes = await sb('/rest/v1/store_members', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ store_id: storeId, user_id: userId }),
    })
    if (!memberRes.ok && memberRes.status !== 409) {
      const detail = await memberRes.text()
      console.error('Supabase member insert failed:', memberRes.status, detail.slice(0, 200))
      res.status(502).json({ error: '店舗メンバーの追加に失敗しました' }); return
    }

    res.status(200).json({ ok: true, userId })
  } catch (error) {
    console.error('Create user API error:', error?.message || 'unknown')
    res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}
