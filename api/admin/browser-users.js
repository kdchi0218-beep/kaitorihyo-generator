import { enforceSameOriginJson } from '../_lib/request-security.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

class AccountDeletionError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function normalizeBrowserResetRequest(input = {}) {
  const userId = String(input.userId || '').trim()
  const reason = String(input.reason || '').trim()
  if (!UUID_PATTERN.test(userId)) throw new Error('対象ユーザーが正しくありません')
  if (reason.length < 2 || reason.length > 200) throw new Error('解除理由は2〜200文字で入力してください')
  return { userId, reason }
}

export function normalizeAccountDeleteRequest(input = {}) {
  const userId = String(input.userId || '').trim()
  const email = String(input.email || '').trim().toLowerCase()
  const reason = String(input.reason || '').trim().replace(/\s+/g, ' ')
  if (!UUID_PATTERN.test(userId)) throw new Error('対象ユーザーが正しくありません')
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new Error('対象メールアドレスが正しくありません')
  if (reason.length < 2 || reason.length > 200) throw new Error('削除理由は2〜200文字で入力してください')
  return { userId, email, reason }
}

export function mergeBrowserUsers({ users = [], admins = [], members = [], stores = [], bindings = [] }) {
  const adminIds = new Set(admins.map(row => row.user_id))
  const storeNames = new Map(stores.map(store => [store.id, store.name]))
  const memberships = new Map()
  const membershipStoreIds = new Map()
  for (const member of members) {
    const name = storeNames.get(member.store_id)
    if (!name) continue
    const values = memberships.get(member.user_id) || []
    if (!values.includes(name)) values.push(name)
    memberships.set(member.user_id, values)
    const ids = membershipStoreIds.get(member.user_id) || []
    if (!ids.includes(member.store_id)) ids.push(member.store_id)
    membershipStoreIds.set(member.user_id, ids)
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
        storeIds: membershipStoreIds.get(user.id) || [],
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

async function deletionJson(response, message) {
  const raw = await response.text().catch(() => '')
  if (!response.ok) {
    console.error(message, response.status, raw.slice(0, 200))
    throw new AccountDeletionError(502, message)
  }
  try { return raw ? JSON.parse(raw) : null } catch {
    throw new AccountDeletionError(502, message)
  }
}

async function deletionRows(response) {
  const parsed = await deletionJson(response, '対象アカウントを確認できません')
  if (!Array.isArray(parsed)) throw new AccountDeletionError(502, '対象アカウントを確認できません')
  return parsed
}

async function deletionLookup(serviceRequest, path) {
  try {
    return await serviceRequest(path)
  } catch (error) {
    console.error('Account deletion lookup failed:', error?.message || 'unknown')
    throw new AccountDeletionError(502, '対象アカウントを確認できません')
  }
}

async function confirmAccountDeleted(serviceRequest, authPath) {
  try {
    const verifyResponse = await serviceRequest(authPath)
    return verifyResponse.status === 404
  } catch {
    return false
  }
}

async function deleteStoreAccount(account, serviceRequest) {
  const encodedUserId = encodeURIComponent(account.userId)
  const adminResponse = await deletionLookup(
    serviceRequest,
    `/rest/v1/app_admins?select=user_id&user_id=eq.${encodedUserId}&limit=1`,
  )
  const admins = await deletionRows(adminResponse)
  if (admins.length > 0) {
    throw new AccountDeletionError(409, '管理者アカウントはこの画面から削除できません。運営担当へ依頼してください。')
  }

  const memberResponse = await deletionLookup(
    serviceRequest,
    `/rest/v1/store_members?select=user_id&user_id=eq.${encodedUserId}&limit=1`,
  )
  const members = await deletionRows(memberResponse)
  if (members.length === 0) {
    throw new AccountDeletionError(404, '削除できる店舗アカウントが見つかりません。一覧を再読込してください。')
  }

  const authPath = `/auth/v1/admin/users/${encodedUserId}`
  const userResponse = await deletionLookup(serviceRequest, authPath)
  if (userResponse.status === 404) {
    throw new AccountDeletionError(404, '削除できる店舗アカウントが見つかりません。一覧を再読込してください。')
  }
  const userBody = await deletionJson(userResponse, '対象アカウントを確認できません')
  const targetUser = userBody?.user || userBody
  if (
    String(targetUser?.id || '').toLowerCase() !== account.userId.toLowerCase()
    || String(targetUser?.email || '').trim().toLowerCase() !== account.email
  ) {
    throw new AccountDeletionError(409, '対象アカウントの情報が変わりました。一覧を再読込してやり直してください。')
  }

  let deleteResponse
  try {
    deleteResponse = await serviceRequest(authPath, { method: 'DELETE' })
  } catch (error) {
    console.error('Auth account deletion request failed:', error?.message || 'unknown')
    if (await confirmAccountDeleted(serviceRequest, authPath)) return
    throw new AccountDeletionError(502, 'アカウントを削除できません。時間をおいて再度お試しください。')
  }

  if (deleteResponse.ok) return
  const detail = await deleteResponse.text().catch(() => '')
  console.error('Auth account deletion failed:', deleteResponse.status, detail.slice(0, 200))
  if (deleteResponse.status === 404) return
  if (deleteResponse.status >= 500 && await confirmAccountDeleted(serviceRequest, authPath)) return
  if (
    [400, 409, 422].includes(deleteResponse.status)
    || /storage|object|owner/i.test(detail)
  ) {
    throw new AccountDeletionError(
      409,
      'このアカウントが所有する保存画像などがあるため削除できません。運営担当へ連絡してください。',
    )
  }
  throw new AccountDeletionError(502, 'アカウントを削除できません。時間をおいて再度お試しください。')
}

export function createBrowserUsersHandler({ authenticateBoundRequest, requireAdmin, serviceRequest }) {
  return async function browserUsersHandler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store')
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
      res.setHeader('Allow', 'GET, POST, DELETE')
      res.status(405).json({ error: 'GET, POST or DELETE only' })
      return
    }
    if (req.method !== 'GET' && !enforceSameOriginJson(req, res)) return

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

      if (req.method === 'DELETE') {
        let account
        try { account = normalizeAccountDeleteRequest(req.body) } catch (error) {
          res.status(400).json({ error: error.message })
          return
        }
        if (account.userId.toLowerCase() === String(auth.user.id || '').toLowerCase()) {
          res.status(409).json({ error: '現在ログイン中の管理者自身のアカウントは削除できません。' })
          return
        }

        await deleteStoreAccount(account, serviceRequest)
        console.info('Store account deleted', {
          actorUserId: auth.user.id,
          targetUserId: account.userId,
        })
        res.status(200).json({ ok: true, userId: account.userId })
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
          headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
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
      if (error instanceof AccountDeletionError) {
        res.status(error.status).json({ error: error.message })
        return
      }
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
