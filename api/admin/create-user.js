// Vercel Serverless Function: 管理者が新規店舗ユーザーを作成する
// service_role が必要なためサーバー側で実行。呼び出し元が本当に管理者か必ず検証する。
//
// POST /api/admin/create-user
// headers: Authorization: Bearer <管理者のaccess_token>
// body: { email, password, storeId }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY

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

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return }
  if (!SUPABASE_URL || !SECRET) { res.status(500).json({ error: 'server not configured' }); return }

  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) { res.status(401).json({ error: '認証が必要です' }); return }

    // 1) 呼び出し元の本人確認
    const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SECRET, Authorization: `Bearer ${token}` },
    })
    if (!meRes.ok) { res.status(401).json({ error: 'セッションが無効です' }); return }
    const me = await meRes.json()

    // 2) 管理者か検証（app_admins）
    const adminRes = await sb(`/rest/v1/app_admins?select=user_id&user_id=eq.${me.id}`)
    const admins = await adminRes.json()
    if (!Array.isArray(admins) || admins.length === 0) {
      res.status(403).json({ error: '管理者のみ実行できます' }); return
    }

    const { email, password, storeId, invite } = req.body || {}
    if (!email || !storeId) {
      res.status(400).json({ error: 'email, storeId は必須です' }); return
    }
    // 招待方式: パスワード未指定 or invite=true → 招待メールを送る（ユーザーが後でPW設定）
    const inviteMode = invite === true || !password

    // 3) ユーザー作成（既存なら拾う）
    let userId = null
    if (inviteMode) {
      const invRes = await sb('/auth/v1/invite', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      if (invRes.ok) {
        userId = (await invRes.json()).id
      } else {
        const t = await invRes.text()
        if (invRes.status === 422 || /already|exist|registered/i.test(t)) {
          // 既存ユーザー → 検索してメンバー追加のみ
          const listRes = await sb(`/auth/v1/admin/users?per_page=1000`)
          const list = await listRes.json()
          const found = (list.users || list).find(u => u.email === email)
          if (!found) { res.status(500).json({ error: '既存ユーザーの取得に失敗' }); return }
          userId = found.id
        } else {
          res.status(500).json({ error: `招待送信失敗: ${t.slice(0, 140)}` }); return
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
        const t = await createRes.text()
        if (createRes.status === 422 || /exist/i.test(t)) {
          const listRes = await sb(`/auth/v1/admin/users?per_page=1000`)
          const list = await listRes.json()
          const found = (list.users || list).find(u => u.email === email)
          if (!found) { res.status(500).json({ error: '既存ユーザーの取得に失敗' }); return }
          userId = found.id
          // 既存ユーザー（招待済み等）のパスワードを上書き＋メール確認済みにする
          await sb(`/auth/v1/admin/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ password, email_confirm: true }),
          })
        } else {
          res.status(500).json({ error: `ユーザー作成失敗: ${t.slice(0, 120)}` }); return
        }
      }
    }

    // 4) 店舗メンバーに追加
    const memRes = await sb('/rest/v1/store_members', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ store_id: storeId, user_id: userId }),
    })
    if (!memRes.ok && memRes.status !== 409) {
      const t = await memRes.text()
      res.status(500).json({ error: `メンバー追加失敗: ${t.slice(0, 120)}` }); return
    }

    res.status(200).json({ ok: true, userId })
  } catch (err) {
    res.status(500).json({ error: err?.message || 'unknown error' })
  }
}
