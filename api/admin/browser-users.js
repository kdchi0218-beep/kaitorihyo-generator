import { enforceSameOriginJson } from '../_lib/request-security.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeBrowserResetRequest(input = {}) {
  const userId = String(input.userId || '').trim()
  const reason = String(input.reason || '').trim()
  if (!UUID_PATTERN.test(userId)) throw new Error('対象ユーザーが正しくありません')
  if (reason.length < 2 || reason.length > 200) throw new Error('解除理由は2〜200文字で入力してください')
  return { userId, reason }
}

export function mergeBrowserUsers({ users = [], admins = [], members = [], stores = [], bindings = [] }) {
  const adminIds = new Set(admins.map(row => row.user_id))
  const storeNames = new Map(stores.map(store => [store.id, store.name]))
  const memberships = new Map()
  for (const member of members) {
    const name = storeNames.get(member.store_id)
    if (!name) continue
    const values = memberships.get(member.user_id) || []
    if (!values.includes(name)) values.push(name)
    memberships.set(member.user_id, values)
  }
  const activeBindings = new Map(bindings.map(binding => [binding.user_id, binding]))

  return users
    .map(user => {
      const binding = activeBindings.get(user.id)
      return {
        id: user.id,
        email: String(user.email || ''),
        isAdmin: adminIds.has(user.id),
        stores: memberships.get(user.id) || [],
        browser: {
          bound: !!binding,
          boundAt: binding?.bound_at || null,
          lastSeenAt: binding?.last_seen_at || null,
        },
      }
    })
    .sort((a, b) => a.email.localeCompare(b.email, 'ja'))
}

async function jsonResponse(response, message) {
  const raw = await response.text().catch(() => '')
  if (!response.ok) {
    console.error(message, response.status, raw.slice(0, 200))
    throw new Error(message)
  }
  if (!raw) return []
  try { return JSON.parse(raw) } catch { throw new Error(message) }
}

async function listAuthUsers(serviceRequest) {
  const users = []
  const perPage = 200
  for (let page = 1; page <= 50; page += 1) {
    const response = await serviceRequest(`/auth/v1/admin/users?page=${page}&per_page=${perPage}`)
    const body = await jsonResponse(response, 'Authユーザー一覧を取得できません')
    const batch = Array.isArray(body) ? body : (body.users || [])
    users.push(...batch.map(user => ({ id: user.id, email: user.email })))
    if (batch.length < perPage) return users
  }
  throw new Error('Authユーザー一覧の取得上限を超えました')
}

export function createBrowserUsersHandler({ authenticateBoundRequest, requireAdmin, serviceRequest }) {
  return async function browserUsersHandler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      res.status(405).json({ error: 'GET or POST only' })
      return
    }
    if (req.method === 'POST' && !enforceSameOriginJson(req, res)) return

    try {
      const auth = await authenticateBoundRequest(req, res)
      await requireAdmin(auth)

      if (req.method === 'GET') {
        const [users, admins, members, stores, bindings] = await Promise.all([
          listAuthUsers(serviceRequest),
          serviceRequest('/rest/v1/app_admins?select=user_id').then(r => jsonResponse(r, '管理者一覧を取得できません')),
          serviceRequest('/rest/v1/store_members?select=user_id,store_id').then(r => jsonResponse(r, '店舗所属を取得できません')),
          serviceRequest('/rest/v1/stores?select=id,name&order=name.asc').then(r => jsonResponse(r, '店舗一覧を取得できません')),
          serviceRequest('/rest/v1/browser_bindings?select=id,user_id,bound_at,last_seen_at&revoked_at=is.null')
            .then(r => jsonResponse(r, 'ブラウザ登録を取得できません')),
        ])
        res.status(200).json({ users: mergeBrowserUsers({ users, admins, members, stores, bindings }) })
        return
      }

      let reset
      try { reset = normalizeBrowserResetRequest(req.body) } catch (error) {
        res.status(400).json({ error: error.message })
        return
      }
      if (reset.userId.toLowerCase() === String(auth.user.id || '').toLowerCase()) {
        res.status(409).json({ error: '現在ログイン中の管理者自身は解除できません。別の管理者から解除してください。' })
        return
      }

      const lookup = await serviceRequest(
        `/rest/v1/browser_bindings?select=id&user_id=eq.${encodeURIComponent(reset.userId)}&revoked_at=is.null&limit=1`,
      )
      const active = await jsonResponse(lookup, 'ブラウザ登録を確認できません')
      if (!active[0]) {
        res.status(409).json({ error: 'このユーザーに有効なブラウザ登録はありません' })
        return
      }

      const now = new Date().toISOString()
      const revoke = await serviceRequest(
        `/rest/v1/browser_bindings?id=eq.${encodeURIComponent(active[0].id)}&revoked_at=is.null`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            revoked_at: now,
            revoked_by: auth.user.id,
            revocation_reason: reset.reason,
          }),
        },
      )
      const revoked = await jsonResponse(revoke, 'ブラウザ登録を解除できません')
      if (!revoked[0]) {
        res.status(409).json({ error: 'ブラウザ登録はすでに解除されています' })
        return
      }

      res.status(200).json({ ok: true })
    } catch (error) {
      if (error?.status && error?.code) {
        res.status(error.status).json({ error: error.message, code: error.code })
        return
      }
      console.error('Browser users API error:', error?.message || 'unknown')
      res.status(500).json({ error: 'ブラウザ管理処理に失敗しました' })
    }
  }
}

export default async function handler(req, res) {
  const session = await import('../_lib/browser-session.js')
  return createBrowserUsersHandler(session)(req, res)
}
