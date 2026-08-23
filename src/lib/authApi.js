export class AuthApiError extends Error {
  constructor(message, { status = 500, code = 'AUTH_ERROR' } = {}) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
    this.code = code
  }
}

async function parseResponse(res) {
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new AuthApiError(json.error || `認証処理に失敗しました (${res.status})`, {
      status: res.status,
      code: json.code || 'AUTH_ERROR',
    })
  }
  return json
}

export function createAuthApi(fetchImpl = globalThis.fetch) {
  const request = async (path, init) => {
    const res = await fetchImpl(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
    })
    return parseResponse(res)
  }

  return {
    login(email, password) {
      return request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(email || '').trim().toLowerCase(), password }),
      })
    },
    getSession() {
      return request('/api/auth/session', { method: 'GET' })
    },
    logout() {
      return request('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    },
  }
}

export const authApi = createAuthApi()
