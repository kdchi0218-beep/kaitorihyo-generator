async function parse(res) {
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(json.error || `ブラウザ管理に失敗しました (${res.status})`)
    error.status = res.status
    error.code = json.code || 'BROWSER_ADMIN_ERROR'
    throw error
  }
  return json
}

export function createBrowserAdminApi(fetchImpl = globalThis.fetch) {
  const request = async (method, body) => parse(await fetchImpl('/api/admin/browser-users', {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }))

  return {
    async list() {
      const result = await request('GET')
      return Array.isArray(result.users) ? result.users : []
    },
    reset(userId, reason) {
      return request('POST', { userId, reason })
    },
  }
}

export const browserAdminApi = createBrowserAdminApi()
